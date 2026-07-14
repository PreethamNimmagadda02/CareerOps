/**
 * Shared (global) portal scan.
 *
 * This runs ONCE for the whole system — on a schedule, not per user — fetching
 * every enabled portal and upserting the results into the global `Posting`
 * corpus. Per-user "scans" then just match this corpus (see src/cli/scan.ts),
 * collapsing the dominant cost from O(users × portals) to O(portals) and
 * eliminating the ATS-ban risk of every user hammering the same boards.
 */
import { chromium } from "playwright";

import { mapLimit } from "./concurrency.js";
import { log } from "./logger.js";
import { loadPortals } from "./portals-db.js";
import { deactivatePostingsNotSeenSince, upsertPostings } from "./postings.js";
import { hasStructuredApi, scanCompany, scanCompanyBrowser } from "./scanner.js";
import type { Job, ScanResult } from "../types.js";

export interface GlobalScanOptions {
  concurrency?: number;
  browserConcurrency?: number;
  useFallback?: boolean;
  /** Cap the number of portals scanned (testing). Disables deactivation. */
  limitPortals?: number;
}

export interface GlobalScanStats {
  portals: number;
  structuredOk: number;
  failed: number;
  fetched: number;
  upserted: number;
  deactivated: number;
  seconds: number;
}

export async function runGlobalScan(opts: GlobalScanOptions = {}): Promise<GlobalScanStats> {
  const concurrency = opts.concurrency ?? 12;
  const browserConcurrency = opts.browserConcurrency ?? 6;
  const scanStartedAt = new Date();
  const t0 = Date.now();

  let companies = (await loadPortals()).filter((c) => c.enabled !== "false");
  if (opts.limitPortals && opts.limitPortals > 0) {
    companies = companies.slice(0, opts.limitPortals);
  }

  const structured = companies.filter(hasStructuredApi);
  const nonStructured = companies.filter((c) => !structured.includes(c));
  const browserable = nonStructured.filter((c) => !!c.careers_url);

  log.step(
    `🌐 Global scan — ${companies.length} portals (${structured.length} structured, ${browserable.length} browser-only)`,
  );

  const results = await mapLimit(structured, concurrency, (c) => scanCompany(c));
  const structuredOk = results.filter((r) => !r.error).length;

  let browserResults: ScanResult[] = [];
  if (opts.useFallback) {
    const fallback = [...browserable, ...results.filter((r) => r.error).map((r) => r.company)];
    if (fallback.length) {
      const browser = await chromium.launch({ headless: true });
      try {
        browserResults = await mapLimit(fallback, browserConcurrency, (c) =>
          scanCompanyBrowser(browser, c),
        );
      } finally {
        await browser.close();
      }
    }
  }

  const all = [...results, ...browserResults];
  const jobs: Job[] = all.flatMap((r) => r.jobs);
  const upserted = await upsertPostings(jobs, scanStartedAt);

  // Retire postings that didn't reappear — but only for boards we successfully
  // scanned this run (skip entirely on a capped/test scan, which is partial).
  let deactivated = 0;
  if (!opts.limitPortals) {
    const scannedOkCompanies = [
      ...new Set(all.filter((r) => !r.error).map((r) => r.company.name)),
    ];
    deactivated = await deactivatePostingsNotSeenSince(scanStartedAt, scannedOkCompanies);
  }

  const stats: GlobalScanStats = {
    portals: companies.length,
    structuredOk,
    failed: all.filter((r) => r.error).length,
    fetched: jobs.length,
    upserted,
    deactivated,
    seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };

  log.step(
    `✅ Global scan done in ${stats.seconds}s — ${stats.fetched} postings fetched, ` +
      `${stats.upserted} upserted, ${stats.deactivated} retired, ${stats.failed} board(s) failed`,
  );
  return stats;
}

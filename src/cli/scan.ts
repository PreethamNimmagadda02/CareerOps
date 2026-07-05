#!/usr/bin/env node
/**
 * career-ops scan — discover relevant jobs across the companies stored in
 * Postgres (the `Portal` table). Manage portals with `npm run portals`.
 *
 * Usage:
 *   career-ops-scan [--compact] [--verbose] [--fallback]
 *                   [--concurrency N] [--browser-concurrency N]
 */
import { AppStatus } from "@prisma/client";
import { chromium } from "playwright";

import { Args } from "../lib/args.js";
import { mapLimit } from "../lib/concurrency.js";
import { log } from "../lib/logger.js";
import { engineeringMatch, isHighSignal, locationMatch, titleMatches } from "../lib/matching.js";
import { loadConfigFromDb } from "../lib/portals-db.js";
import { resolveOwnerUserId } from "../lib/owner.js";
import { hasStructuredApi, scanCompany, scanCompanyBrowser } from "../lib/scanner.js";
import { dedupKey, normalizeUrl } from "../lib/text.js";
import { db } from "../lib/db.js";
import type { Company, FailureInfo, Job, RelevantJob, ScanResult, ScanSummary } from "../types.js";

async function main(): Promise<void> {
  const args = new Args();
  const concurrency = args.number("--concurrency", 8);
  const browserConcurrency = args.number("--browser-concurrency", 3);
  const useFallback = args.has("--fallback");
  const compact = args.has("--compact");
  const verbose = args.has("--verbose");

  const userId = await resolveOwnerUserId();

  const config = await loadConfigFromDb(userId);

  // Block the scan when the user has no positive title-filter keywords. The
  // matcher requires a positive match for a job to be relevant, so a scan with
  // zero "include" keywords can never surface anything — it would only burn
  // time and API calls.
  if (config.positive.length === 0) {
    log.error(
      "❌ No title-filter keywords configured. Add at least one “Include” keyword before scanning:\n" +
        '   npm run portals -- keywords add --kind positive --value "software engineer"\n' +
        "   (or use the Keywords panel in the dashboard).",
    );
    process.exit(1);
  }

  if (config.companies.length === 0) {
    log.error("❌ No portals in Postgres. Add some first: npm run portals -- add --name X --url U");
    process.exit(1);
  }
  const enabledCompanies = config.companies.filter((c) => c.enabled !== "false");

  // Inserts are de-duplicated by URL at write time via the unique index on
  // Application.url (see the backfill in section 1). No need to pre-load
  // existing rows into memory — that keeps this O(1) in extra space.

  const structuredCompanies = enabledCompanies.filter(hasStructuredApi);
  const nonStructured = enabledCompanies.filter((c) => !structuredCompanies.includes(c));

  // A portal with neither an api nor a careers_url cannot be scanned by the
  // CLI (scanCompanyBrowser needs a careers_url). Such rows should not exist,
  // but we guard against them so they are cleanly skipped rather than counted
  // as browser failures.
  const unsupportedCompanies = nonStructured.filter((c) => !!c.careers_url);
  const queryOnlyCompanies = nonStructured.filter((c) => !c.careers_url);

  log.step(`Loaded ${enabledCompanies.length} enabled companies from Postgres`);
  log.step(
    `${structuredCompanies.length} structured boards, ` +
      `${unsupportedCompanies.length} browser-only, ` +
      `${queryOnlyCompanies.length} query-only (agent WebSearch, skipped by CLI)`,
  );

  const startedAt = Date.now();
  const structuredTotal = structuredCompanies.length;
  let structuredDone = 0;
  log.step(
    `🔍 Scanning ${structuredTotal} job boards via structured APIs (concurrency=${concurrency})…`,
  );

  const results = await mapLimit(structuredCompanies, concurrency, async (company) => {
    const result = await scanCompany(company);
    structuredDone += 1;
    logScanProgress(structuredDone, structuredTotal, result);
    return result;
  });

  const structuredOk = results.filter((r) => !r.error).length;
  const structuredJobs = results.reduce((n, r) => n + r.jobs.length, 0);
  log.step(
    `✅ Structured scan done in ${secondsSince(startedAt)}s — ${structuredOk}/${structuredTotal} ok, ${structuredJobs} jobs, ${structuredTotal - structuredOk} failed`,
  );

  let browserResults: ScanResult[] = [];
  if (useFallback) {
    const fallbackCompanies: Company[] = [
      ...unsupportedCompanies,
      ...results.filter((r) => r.error).map((r) => r.company),
    ];
    log.info(`\n🚀 scan   concurrency=${concurrency}  browser-concurrency=${browserConcurrency}`);
    const browserTotal = fallbackCompanies.length;
    let browserDone = 0;
    const browserStartedAt = Date.now();
    log.step(`🌐 Browser fallback for ${browserTotal} boards (concurrency=${browserConcurrency})…`);
    const browser = await chromium.launch({ headless: true });
    try {
      browserResults = await mapLimit(fallbackCompanies, browserConcurrency, async (company) => {
        const result = await scanCompanyBrowser(browser, company);
        browserDone += 1;
        logScanProgress(browserDone, browserTotal, result);
        return result;
      });
    } finally {
      await browser.close();
    }
    const browserOk = browserResults.filter((r) => !r.error).length;
    log.step(
      `✅ Browser fallback done in ${secondsSince(browserStartedAt)}s — ${browserOk}/${browserTotal} ok`,
    );
  }

  log.step("🧮 Filtering and de-duplicating results…");

  const allResults = [...results, ...browserResults];
  const jobs = allResults.flatMap((r) => r.jobs);
  const toFailure = (r: ScanResult): FailureInfo => ({
    company: r.company.name,
    method: r.method,
    error: r.error,
  });
  const structuredFailures = results.filter((r) => r.error).map(toFailure);
  const browserFailures = browserResults.filter((r) => r.error).map(toFailure);

  const relevant: RelevantJob[] = [];
  const skippedTitle: Job[] = [];
  const skippedNonEngineering: Job[] = [];
  const skippedLocation: Job[] = [];
  const duplicates: Job[] = [];
  const seenInRun = new Set<string>();

  for (const job of jobs) {
    const title = job.title || "";
    const match = titleMatches(title, config.positive, config.negative);
    if (!match.relevant) {
      skippedTitle.push(job);
      continue;
    }
    const eng = engineeringMatch(title);
    if (!eng.engineering) {
      skippedNonEngineering.push(job);
      continue;
    }
    const loc = locationMatch(job.location);
    if (!loc.eligible) {
      skippedLocation.push(job);
      continue;
    }
    // URL is the unique identity of a posting; collapse repeats within this run
    // so the backfill never carries the same URL twice.
    const urlKey = normalizeUrl(job.url);
    if (seenInRun.has(urlKey)) {
      duplicates.push(job);
      continue;
    }
    seenInRun.add(urlKey);
    relevant.push({ ...job, match, engineeringMatch: eng, locationMatch: loc });
  }

  const filteredOut =
    skippedTitle.length + skippedNonEngineering.length + skippedLocation.length + duplicates.length;
  log.step(
    `📊 ${jobs.length} jobs fetched → ${relevant.length} relevant (${filteredOut} filtered out, ${duplicates.length} duplicates)`,
  );

  const summary: ScanSummary = {
    scannedAt: new Date().toISOString(),
    enabledCompanies: enabledCompanies.length,
    structuredCompanies: structuredCompanies.length,
    unsupportedCompanies: nonStructured.map((c) => c.name),
    browserFallbackCompanies: browserResults.length,
    successfulCompanies: allResults.filter((r) => !r.error).length,
    structuredFailures,
    browserFailures,
    failedCompanies: browserResults.length ? browserFailures : structuredFailures,
    totalJobs: jobs.length,
    engineeringRelevant: relevant.length,
    relevantNew: relevant.length,
    relevantDuplicates: duplicates.length,
    skippedTitle: skippedTitle.length,
    skippedNonEngineering: skippedNonEngineering.length,
    skippedLocation: skippedLocation.length,
    relevant,
    shortlist: relevant.filter(isHighSignal).slice(0, 80),
  };

  log.step(`🏁 Scan finished in ${secondsSince(startedAt)}s`);

  // ── 1. Backfill new shortlisted jobs (URL-deduped) ───────────────────────
  // Stage every shortlisted posting into an in-memory `backfill` buffer, then
  // flush it in a single statement. The unique index on Application.url turns
  // createMany({ skipDuplicates }) into an `INSERT … ON CONFLICT (url) DO
  // NOTHING`: a posting whose URL is already tracked is ignored, a brand-new
  // URL is appended. This is one set-based round-trip — O(N) time and no
  // pre-load of existing rows — and the buffer is released right after.
  if (summary.shortlist.length > 0) {
    const date = new Date().toISOString().slice(0, 10);

    const backfill = summary.shortlist.map((job) => ({
      userId,
      date,
      company: job.company,
      role: job.title,
      url: job.url,
      score: "N/A",
      status: AppStatus.Evaluated,
      pdf: "❌",
      reportName: "",
    }));

    const backfillSnapshot = backfill.map((j) => ({
      company: j.company,
      role: j.role,
      url: j.url,
    }));

    const { count: addedCount } = await db.application.createMany({
      data: backfill,
      skipDuplicates: true,
    });

    // Delete the backfill once it has been flushed to Postgres.
    backfill.length = 0;

    if (addedCount > 0) {
      log.step(`➕ Added ${addedCount} new shortlisted job(s) to Postgres:`);
      for (const j of backfillSnapshot) {
        log.info(`   ${j.company} — ${j.role}`);
        log.info(`   🔗 ${j.url}`);
      }
    } else {
      log.step(`No new jobs to add (all shortlisted URLs already in Postgres).`);
    }
  }

  // ── 2. Prune closed job postings ─────────────────────────────────────────
  // If a job no longer appears in the current scan's relevant results, the
  // posting has been filled or removed. Any record whose status shows the
  // candidate has NOT yet actively engaged (Evaluated / Discarded / SKIP /
  // blank) is deleted — a score and report for a closed job have no value.
  //
  // Records where the candidate HAS taken action are always kept:
  //   Applied | Responded | Interview | Offer | Rejected
  //
  // The Nextcloud report file (if any) becomes orphaned but is left intact;
  // it can serve as a future reference for the company's requirements.
  const ACTIVE_STATUSES: AppStatus[] = [
    AppStatus.Applied,
    AppStatus.Responded,
    AppStatus.Interview,
    AppStatus.Offer,
    AppStatus.Rejected,
  ];

  if (summary.relevant.length > 0) {
    const currentKeys = new Set(summary.relevant.map((j) => dedupKey(j.company, j.title)));

    // Load all applications that are NOT in an active candidate status —
    // these are the only ones eligible for pruning.
    const pruneable = await db.application.findMany({
      where: { userId, status: { notIn: ACTIVE_STATUSES } },
      select: { id: true, company: true, role: true, status: true },
    });

    const stale = pruneable.filter((a) => !currentKeys.has(dedupKey(a.company, a.role)));

    if (stale.length > 0) {
      await db.application.deleteMany({
        where: { id: { in: stale.map((a) => a.id) } },
      });
      log.step(
        `🗑️  Pruned ${stale.length} application(s) whose job postings are no longer active.`,
      );
    } else {
      log.step(`All tracked jobs are still active in scan results.`);
    }
  }

  if (compact) {
    printCompact(summary, browserResults.length, verbose);
  } else {
    log.info(JSON.stringify(summary, null, 2));
  }
}

/** Log a per-company progress line during scanning (to stderr). */
function logScanProgress(done: number, total: number, result: ScanResult): void {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const counter = `[${String(done).padStart(String(total).length, " ")}/${total} ${String(pct).padStart(3, " ")}%]`;
  if (result.error) {
    log.step(`${counter} ✗ ${result.company.name} (${result.method}) — ${result.error}`);
  } else {
    const n = result.jobs.length;
    log.step(
      `${counter} ✓ ${result.company.name} (${result.method}) — ${n} job${n === 1 ? "" : "s"}`,
    );
  }
}

/** Whole seconds elapsed since a Date.now() timestamp, as a string. */
function secondsSince(startMs: number): string {
  return ((Date.now() - startMs) / 1000).toFixed(1);
}

function printCompact(summary: ScanSummary, browserCount: number, verbose: boolean): void {
  const byCompany = new Map<string, RelevantJob[]>();
  for (const job of summary.shortlist) {
    const list = byCompany.get(job.company) ?? [];
    list.push(job);
    byCompany.set(job.company, list);
  }
  log.info(`Portal Scan ${new Date().toISOString().slice(0, 10)}`);
  log.info(`Enabled companies: ${summary.enabledCompanies}`);
  log.info(`Structured boards scanned: ${summary.structuredCompanies}`);
  log.info(`Browser fallback boards attempted: ${browserCount}`);
  log.info(`Successful boards: ${summary.successfulCompanies}`);
  log.info(`Unrecovered failed boards: ${summary.failedCompanies.length}`);
  log.info(`Non-API boards (browser + query-only): ${summary.unsupportedCompanies.length}`);
  log.info(`Jobs fetched: ${summary.totalJobs}`);
  log.info(`India/remote engineering roles after filters: ${summary.engineeringRelevant}`);
  log.info(`Skipped non-engineering roles: ${summary.skippedNonEngineering}`);
  log.info(`Skipped non-India/non-remote roles: ${summary.skippedLocation}`);
  log.info(`High-signal shortlist: ${summary.shortlist.length}`);
  log.info("");
  for (const [company, companyJobs] of byCompany) {
    log.info(company);
    for (const job of companyJobs.slice(0, 8)) {
      log.info(`- ${job.title} | ${job.location || "Location not listed"} | ${job.url}`);
    }
  }
  log.info("");
  if (verbose && summary.structuredFailures.length) {
    log.info("Structured API failures recovered by browser fallback when --fallback is used:");
    for (const item of summary.structuredFailures) log.info(`- ${item.company}: ${item.error}`);
  }
  if (summary.browserFailures.length) {
    log.info("");
    log.info("Browser fallback failures:");
    for (const item of summary.browserFailures) log.info(`- ${item.company}: ${item.error}`);
  }
  if (!browserCount && summary.unsupportedCompanies.length) {
    log.info("");
    log.info("Run again with --fallback for these browser-scannable boards:");
    for (const company of summary.unsupportedCompanies) log.info(`- ${company}`);
    log.info("(Query-only boards are discoverable via agent WebSearch only.)");
  }
  log.info("");
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

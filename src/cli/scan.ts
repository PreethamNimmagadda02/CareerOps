#!/usr/bin/env node
/**
 * career-ops scan — discover relevant jobs across the companies in portals.yml.
 *
 * Usage:
 *   career-ops-scan [--compact] [--verbose] [--fallback]
 *                   [--concurrency N] [--browser-concurrency N]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { chromium } from "playwright";

import { Args } from "../lib/args.js";
import { mapLimit } from "../lib/concurrency.js";
import { log } from "../lib/logger.js";
import { engineeringMatch, isHighSignal, locationMatch, titleMatches } from "../lib/matching.js";
import { paths } from "../lib/paths.js";
import { parseConfig } from "../lib/portals.js";
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

  if (!existsSync(paths.portals)) {
    log.error(`❌ portals.yml not found at ${paths.portals}`);
    process.exit(1);
  }

  const config = parseConfig(readFileSync(paths.portals, "utf8"));
  const enabledCompanies = config.companies.filter((c) => c.enabled !== "false");

  const dedupText = [paths.pipeline, paths.scanHistory]
    .map((file) => (existsSync(file) ? readFileSync(file, "utf8") : ""))
    .join("\n")
    .toLowerCase();
  const seenUrls = new Set((dedupText.match(/https?:\/\/[^\s|)]+/g) || []).map(normalizeUrl));

  // Dedup company+role keys against applications already tracked in Postgres.
  const existingApps = await db.application.findMany({ select: { company: true, role: true } });
  const seenDedupKeys = new Set(existingApps.map((a) => dedupKey(a.company, a.role)));

  const structuredCompanies = enabledCompanies.filter(hasStructuredApi);
  const unsupportedCompanies = enabledCompanies.filter((c) => !structuredCompanies.includes(c));

  log.step(`Loaded ${enabledCompanies.length} enabled companies from portals.yml`);
  log.step(
    `${structuredCompanies.length} structured boards, ${unsupportedCompanies.length} custom/non-API boards`,
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
    const urlKey = normalizeUrl(job.url);
    const key = `${urlKey} ${dedupKey(job.company, title)}`;
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
    if (
      seenUrls.has(urlKey) ||
      seenDedupKeys.has(dedupKey(job.company, title)) ||
      dedupText.includes(dedupKey(job.company, title)) ||
      seenInRun.has(key)
    ) {
      duplicates.push(job);
      continue;
    }
    seenInRun.add(key);
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
    unsupportedCompanies: unsupportedCompanies.map((c) => c.name),
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

  writeFileSync(paths.scanResults, JSON.stringify(summary, null, 2));
  log.step(
    `💾 Wrote ${summary.relevant.length} relevant (${summary.shortlist.length} shortlisted) to ${paths.scanResults}`,
  );
  log.step(`🏁 Scan finished in ${secondsSince(startedAt)}s`);

  if (summary.shortlist.length > 0) {
    const date = new Date().toISOString().slice(0, 10);
    let addedCount = 0;

    for (const job of summary.shortlist) {
      const key = dedupKey(job.company, job.title);
      if (seenDedupKeys.has(key)) continue;

      // Insert with an autoincrement id (no explicit id) so the Postgres
      // sequence stays consistent for future inserts.
      await db.application.create({
        data: {
          date,
          company: job.company,
          role: job.title,
          score: "N/A",
          status: "Evaluated",
          pdf: "❌",
          report: "",
          notes: "Imported from recent scan (shortlist)",
        },
      });
      seenDedupKeys.add(key);
      addedCount += 1;
    }

    if (addedCount > 0) {
      log.info(`\nAdded ${addedCount} new shortlisted jobs to Postgres.`);
    } else {
      log.info(`\nNo new jobs to add (all shortlisted jobs already in Postgres).`);
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
  log.info(`Custom/non-API boards: ${summary.unsupportedCompanies.length}`);
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
    log.info("Run again with --fallback for these custom/non-API boards:");
    for (const company of summary.unsupportedCompanies) log.info(`- ${company}`);
  }
  log.info("");
  log.info(`Full JSON: ${paths.scanResults}`);
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

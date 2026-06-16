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

  const dedupText = [paths.pipeline, paths.applications, paths.scanHistory]
    .map((file) => (existsSync(file) ? readFileSync(file, "utf8") : ""))
    .join("\n")
    .toLowerCase();
  const seenUrls = new Set((dedupText.match(/https?:\/\/[^\s|)]+/g) || []).map(normalizeUrl));

  const structuredCompanies = enabledCompanies.filter(hasStructuredApi);
  const unsupportedCompanies = enabledCompanies.filter((c) => !structuredCompanies.includes(c));

  const results = await mapLimit(structuredCompanies, concurrency, scanCompany);

  let browserResults: ScanResult[] = [];
  if (useFallback) {
    const fallbackCompanies: Company[] = [
      ...unsupportedCompanies,
      ...results.filter((r) => r.error).map((r) => r.company),
    ];
    log.info(`\n🚀 scan   concurrency=${concurrency}  browser-concurrency=${browserConcurrency}`);
    const browser = await chromium.launch({ headless: true });
    try {
      browserResults = await mapLimit(fallbackCompanies, browserConcurrency, (company) =>
        scanCompanyBrowser(browser, company),
      );
    } finally {
      await browser.close();
    }
  }

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
      dedupText.includes(dedupKey(job.company, title)) ||
      seenInRun.has(key)
    ) {
      duplicates.push(job);
      continue;
    }
    seenInRun.add(key);
    relevant.push({ ...job, match, engineeringMatch: eng, locationMatch: loc });
  }

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

  if (summary.shortlist.length > 0) {
    const date = new Date().toISOString().slice(0, 10);
    let mdTable = `# Applications Tracker\n\n| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |\n|---|---|---|---|---|---|---|---|\n`;
    let id = 1;
    for (const job of summary.shortlist) {
      mdTable += `| ${id++} | ${date} | ${job.company} | ${job.title} | N/A | Evaluated | ❌ |  | Imported from recent scan (shortlist) |\n`;
    }
    writeFileSync(paths.applications, mdTable);
    log.info(
      `\nCompletely overwrote applications.md with ${summary.shortlist.length} shortlisted jobs.`,
    );
  }

  if (compact) {
    printCompact(summary, browserResults.length, verbose);
  } else {
    log.info(JSON.stringify(summary, null, 2));
  }
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

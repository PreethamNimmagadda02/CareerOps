#!/usr/bin/env node
/**
 * career-ops scan-portals — the SHARED, scheduled scan.
 *
 * Fetches every enabled portal once and upserts the results into the global
 * `Posting` corpus. Run this on a schedule (EventBridge / cron), NOT per user —
 * each user's `scan` then just matches this corpus against their preferences.
 *
 * Usage:
 *   career-ops-scan-portals [--fallback] [--concurrency N]
 *                           [--browser-concurrency N] [--limit N]
 *                           [--no-jd] [--jd-concurrency N] [--jd-limit N]
 */
import { Args } from "../lib/args.js";
import { runGlobalScan } from "../lib/global-scan.js";
import { log } from "../lib/logger.js";

async function main(): Promise<void> {
  const args = new Args();
  const stats = await runGlobalScan({
    concurrency: args.number("--concurrency", 12),
    browserConcurrency: args.number("--browser-concurrency", 6),
    useFallback: args.has("--fallback"),
    limitPortals: args.has("--limit") ? args.number("--limit", 0) : undefined,
    fetchJD: !args.has("--no-jd"),
    jdConcurrency: args.number("--jd-concurrency", 6),
    jdLimit: args.number("--jd-limit", 300),
  });

  log.info(
    `📊 portals=${stats.portals} fetched=${stats.fetched} upserted=${stats.upserted} ` +
      `retired=${stats.deactivated} failed=${stats.failed} ` +
      `jdCached=${stats.jdFetched} jdFailed=${stats.jdFailed} in ${stats.seconds}s`,
  );
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Health-check every enabled Portal.
 *
 * Checks two things per portal:
 *   1. careersUrl  — HTTP reachability (browser/Playwright fallback path)
 *   2. api         — Greenhouse JSON endpoint (primary scan path)
 *
 * A portal is only TRULY broken when it has NO working scan path:
 *   - careersUrl unreachable AND no api  → scanner has nothing to call
 *   - api returns non-200               → structured scan will fail
 *
 * 403/429 on careersUrl when a working api exists = bot-protection on the
 * HTML page; the scanner never visits that page, it uses the API directly.
 * These are reported separately as "bot-protected" and are NOT broken.
 *
 * Usage:
 *   npx tsx scripts/check-portals.ts [--concurrency N] [--timeout-ms N]
 */
import "dotenv/config";
import { db } from "../src/lib/db.js";
import { mapLimit } from "../src/lib/concurrency.js";
import { log } from "../src/lib/logger.js";

const args = process.argv.slice(2);
const getArg = (flag: string, def: number) => {
  const i = args.indexOf(flag);
  return i !== -1 ? parseInt(args[i + 1] ?? String(def)) : def;
};
const CONCURRENCY = getArg("--concurrency", 30);
const TIMEOUT_MS  = getArg("--timeout-ms", 12000);

const UA = "Mozilla/5.0 (compatible; CareerOps-checker/1.0)";

type CheckResult = {
  name: string;
  careersUrl: string;
  api: string | null;
  careersStatus: number | string;
  apiStatus: number | string | null;
  apiJobs: number | null;
};

async function checkUrl(url: string): Promise<{ status: number | string }> {
  if (!url) return { status: "NO_URL" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET", redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": UA },
    });
    return { status: res.status };
  } catch (err: unknown) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes("abort") || msg.includes("timed out")) return { status: "TIMEOUT" };
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) return { status: "DNS_FAIL" };
    if (msg.includes("ECONNREFUSED")) return { status: "CONN_REFUSED" };
    if (msg.includes("CERT") || msg.includes("certificate")) return { status: "TLS_ERROR" };
    return { status: `ERR:${msg.slice(0, 40)}` };
  } finally { clearTimeout(timer); }
}

async function checkApi(url: string): Promise<{ status: number | string; jobs: number | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return { status: res.status, jobs: null };
    const body = await res.json() as { jobs?: unknown[] };
    return { status: res.status, jobs: Array.isArray(body?.jobs) ? body.jobs.length : null };
  } catch (err: unknown) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes("abort") || msg.includes("timed out")) return { status: "TIMEOUT", jobs: null };
    if (msg.includes("ENOTFOUND")) return { status: "DNS_FAIL", jobs: null };
    return { status: `ERR:${msg.slice(0, 40)}`, jobs: null };
  } finally { clearTimeout(timer); }
}

function httpOk(status: number | string): boolean {
  return typeof status === "number" && status < 400;
}

// 403/429 = bot-protection (Cloudflare). The scanner uses Playwright or the
// Greenhouse API for these — neither goes through the careers HTML page.
function botBlocked(status: number | string): boolean {
  return status === 403 || status === 429;
}

async function main(): Promise<void> {
  // Only check enabled portals — disabled ones are intentionally off.
  const portals = await db.portal.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
  });

  log.info(`🔍 Checking ${portals.length} enabled portals  concurrency=${CONCURRENCY}  timeout=${TIMEOUT_MS}ms\n`);

  const results: CheckResult[] = [];
  let done = 0;

  await mapLimit(portals, CONCURRENCY, async (p) => {
    const [careers, api] = await Promise.all([
      checkUrl(p.careersUrl ?? ""),
      p.api ? checkApi(p.api) : Promise.resolve(null),
    ]);

    const r: CheckResult = {
      name: p.name,
      careersUrl: p.careersUrl ?? "",
      api: p.api,
      careersStatus: careers.status,
      apiStatus: api?.status ?? null,
      apiJobs: api?.jobs ?? null,
    };
    results.push(r);
    done++;

    // Only log live if there's a real problem.
    const realProblem =
      (!httpOk(r.careersStatus) && !botBlocked(r.careersStatus) && !r.api) ||
      (r.api && !httpOk(r.apiStatus!));
    if (realProblem) {
      process.stderr.write("\r" + " ".repeat(50) + "\r");
      log.info(`[${done}/${portals.length}] ✗  ${p.name}  careers=${r.careersStatus}${r.api ? `  api=${r.apiStatus}` : ""}`);
    } else {
      process.stderr.write(`\r[${done}/${portals.length}] checking...`);
    }
  });

  process.stderr.write("\r" + " ".repeat(50) + "\r");

  // ── Categorise ────────────────────────────────────────────────────────────
  // Truly broken: no API + careers unreachable (not just bot-blocked).
  const trulyBroken = results.filter(r =>
    !r.api &&
    !httpOk(r.careersStatus) &&
    !botBlocked(r.careersStatus)
  );

  // Bot-blocked on careers HTML, but a working API exists → scanner unaffected.
  const botProtectedWithApi = results.filter(r =>
    r.api &&
    botBlocked(r.careersStatus)
  );

  // Bot-blocked on careers HTML, NO API → scanner uses Playwright.
  const botProtectedNoApi = results.filter(r =>
    !r.api &&
    botBlocked(r.careersStatus)
  );

  // Broken API (structured scan will fail for these).
  const brokenApis = results.filter(r => r.api && !httpOk(r.apiStatus!));

  const apiTotal = results.filter(r => r.api).length;
  const allGood  = trulyBroken.length === 0 && brokenApis.length === 0;

  // ── Report ────────────────────────────────────────────────────────────────
  log.rule("═");
  log.info(`\n📊 SUMMARY`);
  log.info(`   Enabled portals checked : ${results.length}`);
  log.info(`   API endpoints OK        : ${apiTotal - brokenApis.length} / ${apiTotal}  (${brokenApis.length} broken)`);
  log.info(`   careersUrl reachable    : ${results.length - trulyBroken.length - botProtectedWithApi.length - botProtectedNoApi.length} / ${results.length}`);
  log.info(`   Bot-protected (CF/WAF)  : ${botProtectedWithApi.length + botProtectedNoApi.length}  (${botProtectedWithApi.length} have API backup, ${botProtectedNoApi.length} use Playwright)`);

  if (brokenApis.length) {
    log.info(`\n🔴 BROKEN API endpoints — structured scan will fail (${brokenApis.length})`);
    for (const r of brokenApis) {
      log.info(`   [${r.apiStatus}]  ${r.name}`);
      log.info(`         ${r.api}`);
    }
  }

  if (trulyBroken.length) {
    log.info(`\n🔴 TRULY BROKEN — no API and careersUrl unreachable (${trulyBroken.length})`);
    for (const r of trulyBroken) {
      log.info(`   [${r.careersStatus}]  ${r.name}`);
      log.info(`         ${r.careersUrl}`);
    }
  }

  if (botProtectedNoApi.length) {
    log.info(`\n🟡 BOT-PROTECTED, no API — scanner uses Playwright (${botProtectedNoApi.length})`);
    for (const r of botProtectedNoApi)
      log.info(`   [${r.careersStatus}]  ${r.name}  ${r.careersUrl}`);
  }

  if (botProtectedWithApi.length) {
    log.info(`\n✅ BOT-PROTECTED on HTML, API works — scanner unaffected (${botProtectedWithApi.length})`);
    for (const r of botProtectedWithApi)
      log.info(`   [${r.careersStatus}]  ${r.name}`);
  }

  if (allGood) {
    log.info(`\n✅ All scan paths are healthy — no action needed.`);
  } else {
    log.info(`\n⚠️  Action needed: fix the ${trulyBroken.length + brokenApis.length} entries above.`);
  }
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

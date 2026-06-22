#!/usr/bin/env node
/**
 * career-ops evaluate — automatically evaluate shortlisted N/A jobs.
 *
 * Reads pending rows from data/applications.md, fetches each JD via Playwright,
 * runs a structured A–F evaluation through an OpenAI-compatible provider,
 * writes a report .md, and updates the tracker with a real score.
 *
 * Usage:
 *   career-ops-evaluate [--limit N] [--job N] [--dry-run]
 *                       [--provider zen|nvidia|<custom>] [--model NAME]
 *                       [--concurrency N]
 */
import { existsSync, readFileSync } from "node:fs";

import { chromium } from "playwright";

import { Args } from "../lib/args.js";
import { createSemaphore } from "../lib/concurrency.js";
import { loadEnv } from "../lib/env.js";
import { fetchJD, isJdOk } from "../lib/jd.js";
import { callLLM, resolveProvider } from "../lib/llm.js";
import { log } from "../lib/logger.js";
import { paths } from "../lib/paths.js";
import { buildPrompt, parseScore } from "../lib/prompt.js";
import {
  buildUrlIndex,
  nextReportNumber,
  getApplications,
  updateTracker,
  writeReport,
} from "../lib/tracker.js";
import { normalizeKey, today } from "../lib/text.js";

async function main(): Promise<void> {
  const args = new Args();
  const dryRun = args.has("--dry-run");
  const limit = args.number("--limit", 5);
  const onlyRow = args.has("--job") ? args.number("--job", 0) : null;
  const providerArg = args.string("--provider", process.env.CAREER_OPS_PROVIDER || "nvidia");
  const modelArg = args.get("--model") ?? process.env.CAREER_OPS_MODEL ?? null;
  const concurrency = args.number("--concurrency", 8);

  loadEnv();

  const provider = resolveProvider(providerArg);
  const model = modelArg || provider.defaultModel;
  const apiKey = process.env[provider.authEnvVar] || process.env.OPENCODE_API_KEY || "dummy";
  const providerLabel = `${providerArg} / ${model}`;

  if ((!apiKey || apiKey === "dummy") && !dryRun) {
    log.warn(`⚠️  No API key found. Set ${provider.authEnvVar} in .env or env.`);
    log.warn(`   Get your key at: https://opencode.ai/auth  then run /connect in opencode\n`);
  }

  log.info(`🤖 evaluate-agent`);
  log.info(`   provider    : ${providerArg}  (${provider.baseURL})`);
  log.info(`   model       : ${model}`);
  log.info(`   limit       : ${limit}  dry-run=${dryRun}`);
  log.info(`   concurrency : ${concurrency}\n`);

  if (!existsSync(paths.applications)) {
    log.error("❌ data/applications.md not found. Run: npm run scan:fallback");
    process.exit(1);
  }

  const cv = readFileSync(paths.cv, "utf8");
  const profileYml = existsSync(paths.profile)
    ? readFileSync(paths.profile, "utf8")
    : "(profile.yml not found)";
  const allJobs = await getApplications();

  let targets = allJobs.filter((j) => {
    const noScore = j.score.trim() === "N/A" || j.score.trim() === "";
    const noReport = !j.report.trim();
    return noScore && noReport;
  });

  if (onlyRow !== null) {
    targets = targets.filter((j) => j.num === onlyRow);
    if (!targets.length) {
      log.error(`❌ Row #${onlyRow} not found or already has a score/report.`);
      process.exit(1);
    }
  }

  targets = targets.slice(0, limit);

  if (!targets.length) {
    log.info("✅ No pending N/A jobs to evaluate. All done!");
    process.exit(0);
  }

  log.info(`📋 ${targets.length} job(s) queued:\n`);
  for (const j of targets) log.info(`   #${j.num}  ${j.company} — ${j.role}`);
  log.info("");

  const urlIndex = buildUrlIndex();
  const browser = await chromium.launch({ headless: true });
  const date = today();
  const results = { evaluated: 0, skipped: 0, errors: 0 };

  const sem = createSemaphore(concurrency);
  let trackerLock: Promise<void> = Promise.resolve();

  try {
    await Promise.all(
      targets.map((job) =>
        sem(async () => {
          const tag = `[#${job.num}]`;
          log.rule();
          log.info(`${tag} ${job.company} — ${job.role}`);

          let url = urlIndex.get(normalizeKey(job.company, job.role));
          if (!url) {
            const prefix = job.company.toLowerCase().replace(/\s+/g, " ");
            for (const [k, v] of urlIndex) {
              if (k.startsWith(prefix)) {
                url = v;
                break;
              }
            }
          }

          if (!url) {
            log.warn(`${tag} ⚠️  No URL in scan results — skipping. Re-run scan or use --job N.`);
            results.skipped += 1;
            return;
          }
          log.info(`${tag} 🔗 ${url}`);

          log.info(`${tag} 📄 Fetching JD...`);
          const jdText = await fetchJD(browser, url);
          log.info(`${tag} 📄 ${isJdOk(jdText) ? "✓" : "⚠️  partial"} (${jdText.length} chars)`);

          if (dryRun) {
            log.info(`${tag} 🧪 Dry-run: skipping AI call.`);
            results.skipped += 1;
            return;
          }

          log.info(`${tag} 🤖 Evaluating via ${providerLabel}...`);
          let evaluation = "";
          try {
            const prompt = buildPrompt({
              cv,
              profileYml,
              jdText,
              company: job.company,
              role: job.role,
            });
            evaluation = await callLLM({ prompt, apiKey, baseURL: provider.baseURL, model });
            log.info(`${tag} 🤖 ✓`);
          } catch (err) {
            log.info(`${tag} ❌ ${(err as Error).message}`);
            results.errors += 1;
            return;
          }

          const score = parseScore(evaluation);
          log.info(`${tag} 📊 Score: ${score ? score + "/5" : "could not parse — check report"}`);

          trackerLock = trackerLock.then(async () => {
            const reportNum = nextReportNumber();
            const filename = writeReport({
              num: reportNum,
              company: job.company,
              role: job.role,
              url: url as string,
              evaluation,
              providerLabel,
            });
            log.info(`${tag} 📝 reports/${filename}`);

            const updated = await updateTracker(
              job.num,
              score || "N/A",
              reportNum,
              job.company,
              date,
            );
            if (updated) {
              log.info(
                `${tag} ✅ Tracker → #${job.num} score=${score}/5  report=[${String(reportNum).padStart(3, "0")}]`,
              );
            }
          });
          await trackerLock;

          results.evaluated += 1;
        }),
      ),
    );

    await trackerLock;
  } finally {
    await browser.close();
  }

  log.rule("═");
  log.info(
    `📊 ${results.evaluated} evaluated  ${results.skipped} skipped  ${results.errors} errors`,
  );
  if (results.evaluated > 0) {
    log.info(`📁 Reports  → ${paths.reportsDir}/`);
    log.info(`📋 Tracker  → ${paths.applications}`);
  }
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

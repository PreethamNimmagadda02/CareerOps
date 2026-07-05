#!/usr/bin/env node
/**
 * career-ops evaluate — automatically evaluate shortlisted N/A jobs.
 *
 * Reads pending rows from Postgres, fetches each JD via Playwright,
 * runs a structured A–F evaluation through an OpenAI-compatible provider,
 * uploads the report to MinIO, and updates the Postgres row with a real score.
 *
 * Usage:
 *   career-ops-evaluate [--limit N] [--job N] [--dry-run]
 *                       [--provider zen|nvidia|<custom>] [--model NAME]
 *                       [--concurrency N]
 */
import { chromium } from "playwright";

import { Args } from "../lib/args.js";
import { loadCandidateContext } from "../lib/candidate-loader.js";
import { createSemaphore } from "../lib/concurrency.js";
import { loadEnv } from "../lib/env.js";
import { fetchJD, isJdOk } from "../lib/jd.js";
import { callLLM, resolveProvider } from "../lib/llm.js";
import { log } from "../lib/logger.js";
import { buildPrompt } from "../lib/prompt.js";
import { parseEvaluation } from "../lib/evaluation.js";
import { nextReportNumber, getApplications, updateTracker, writeReport } from "../lib/tracker.js";
import { getProfile } from "../lib/profile-store.js";
import { getCV } from "../lib/cv-store.js";
import { validateCandidateReadiness } from "../lib/profile-validation.js";
import { resolveOwnerUserId } from "../lib/owner.js";
import { today } from "../lib/text.js";

async function main(): Promise<void> {
  const args = new Args();
  const dryRun = args.has("--dry-run");
  const limit = args.number("--limit", 5);
  const onlyRow = args.get("--job") ?? null;
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

  const userId = await resolveOwnerUserId();

  // Block evaluation when the candidate's profile/CV is missing required
  // details — an evaluation against a job description is meaningless without
  // the core candidate data filled in.
  const [profileRec, cvRec] = await Promise.all([getProfile(userId), getCV(userId)]);
  const readiness = validateCandidateReadiness(profileRec, cvRec);
  if (!readiness.ok) {
    log.error("❌ Cannot evaluate — your profile is missing required details:");
    for (const m of readiness.missing) log.error(`   • ${m}`);
    log.error("\n   Complete your profile in the dashboard, then re-run evaluate.");
    process.exit(1);
  }

  const { cv, profileYml } = await loadCandidateContext(userId);
  const allJobs = await getApplications(userId);

  // Subsequent evaluations are idempotent: skip an application only when it
  // already has BOTH a report (Postgres `reportName`) AND a score — i.e. a
  // complete evaluation. Anything missing either is (re)queued.
  const isComplete = (j: (typeof allJobs)[number]): boolean => {
    const hasReport = j.reportName.trim() !== "";
    // A real score is a number like "4.2/5". Anything else ("N/A", "N/A/5",
    // "", etc.) means the evaluation never produced a parseable result.
    const hasScore = /^\d+(\.\d+)?\/5$/.test(j.score.trim());
    return hasReport && hasScore;
  };
  let targets = allJobs.filter((j) => !isComplete(j));
  const alreadyComplete = allJobs.length - targets.length;
  if (alreadyComplete > 0) {
    log.info(
      `⏭️  Skipping ${alreadyComplete} application(s) that already have a report and score.`,
    );
  }

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

          const url = job.url;

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

          const insights = parseEvaluation(evaluation);
          const score = insights.score;
          log.info(`${tag} 📊 Score: ${score ? score + "/5" : "could not parse — check report"}`);
          if (insights.recommendation) {
            log.info(`${tag} 🎯 Verdict: ${insights.recommendation.replace(/_/g, " ")}`);
          }

          trackerLock = trackerLock.then(async () => {
            const reportNum = await nextReportNumber();
            const filename = await writeReport({
              userId,
              num: reportNum,
              company: job.company,
              role: job.role,
              url: url as string,
              evaluation,
              providerLabel,
            });
            log.info(`${tag} ☁️  Uploaded → ${filename}`);

            const updated = await updateTracker(
              job.num,
              userId,
              score || "N/A",
              reportNum,
              job.company,
              date,
              insights,
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
    log.info(`☁️  Reports  → MinIO / ${process.env.MINIO_BUCKET ?? "careerops"}/`);
    log.info(`📋 Tracker  → Postgres (Application table)`);
  }
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Backfill missing scores from already-generated reports.
 *
 * For every Application that has a report (`reportName`) but whose `score`
 * is not a proper numeric `X/5` (e.g. the `N/A/5` placeholder left when an
 * older `parseScore` failed to read the report), this re-downloads the report
 * markdown from MinIO, re-parses the overall score, and updates the row.
 *
 * No LLM calls are made — the existing report is the source of truth.
 *
 * Usage:
 *   npx tsx scripts/backfill-scores.ts [--dry-run]
 */
import { Args } from "../src/lib/args.js";
import { db } from "../src/lib/db.js";
import { log } from "../src/lib/logger.js";
import { downloadReport } from "../src/lib/minio.js";
import { resolveOwnerUserId } from "../src/lib/owner.js";
import { parseScore } from "../src/lib/prompt.js";

/** A score cell is "proper" when it starts with a digit, e.g. "3.3/5". */
function hasNumericScore(score: string): boolean {
  return /^\d/.test(score.trim());
}

async function main(): Promise<void> {
  const dryRun = new Args().has("--dry-run");
  const userId = await resolveOwnerUserId();

  const candidates = await db.application.findMany({
    where: { userId, reportName: { not: "" } },
    select: { id: true, company: true, role: true, score: true, reportName: true },
  });

  const pending = candidates.filter((a) => !hasNumericScore(a.score));
  log.info(
    `🔎 ${candidates.length} application(s) with a report; ${pending.length} missing a numeric score.`,
  );

  let fixed = 0;
  let unresolved = 0;

  for (const app of pending) {
    const markdown = await downloadReport(app.reportName);
    if (!markdown) {
      log.warn(`⚠️  ${app.reportName}: report not found in MinIO — skipped.`);
      unresolved += 1;
      continue;
    }

    const score = parseScore(markdown);
    if (!score) {
      log.warn(`⚠️  ${app.reportName}: could not parse a score — skipped.`);
      unresolved += 1;
      continue;
    }

    const newScore = `${score}/5`;
    log.info(`✅ ${app.company} — ${app.role}: ${app.score} → ${newScore}`);
    if (!dryRun) {
      await db.application.update({
        where: { id: app.id },
        data: { score: newScore, updatedAt: new Date() },
      });
    }
    fixed += 1;
  }

  log.info(
    `\n🏁 ${dryRun ? "[dry-run] " : ""}${fixed} fixed, ${unresolved} unresolved, ${
      candidates.length - pending.length
    } already had a score.`,
  );
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

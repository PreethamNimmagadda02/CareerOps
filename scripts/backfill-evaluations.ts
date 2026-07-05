#!/usr/bin/env node
/**
 * Backfill evaluation insights from already-generated reports.
 *
 * For every Application that has a report (`reportName`) but no parsed
 * insights yet (missing `evaluatedAt`, or `--force` for all), this downloads
 * the report markdown from MinIO, parses the recommendation / dimension
 * scores / archetype / comp / TL;DR / gaps, and persists them as columns.
 *
 * No LLM calls are made — the existing report is the source of truth.
 *
 * Usage:
 *   npx tsx scripts/backfill-evaluations.ts [--dry-run] [--force]
 */
import { Args } from "../src/lib/args.js";
import { db } from "../src/lib/db.js";
import { parseEvaluation } from "../src/lib/evaluation.js";
import { log } from "../src/lib/logger.js";
import { downloadReport } from "../src/lib/minio.js";
import { resolveOwnerUserId } from "../src/lib/owner.js";
import { insightColumns } from "../src/lib/tracker.js";

async function main(): Promise<void> {
  const args = new Args();
  const dryRun = args.has("--dry-run");
  const force = args.has("--force");
  const userId = await resolveOwnerUserId();

  const apps = await db.application.findMany({
    where: {
      userId,
      reportName: { not: "" },
      ...(force ? {} : { evaluatedAt: null }),
    },
    orderBy: { createdAt: "asc" },
  });

  if (!apps.length) {
    log.info("✅ Nothing to backfill — all reports already have parsed insights.");
    return;
  }

  log.info(`📋 ${apps.length} application(s) to backfill${dryRun ? " (dry-run)" : ""}\n`);

  const results = { updated: 0, skipped: 0, errors: 0 };

  for (const app of apps) {
    const tag = `[${app.company} — ${app.role.slice(0, 40)}]`;
    const filename = app.reportName.split("/").pop() ?? app.reportName;

    const markdown = await downloadReport(userId, filename);
    if (!markdown) {
      log.warn(`${tag} ⚠️  report not found in MinIO (${filename}) — skipping`);
      results.skipped += 1;
      continue;
    }

    const insights = parseEvaluation(markdown);
    const summary = [
      insights.recommendation ?? "no verdict",
      insights.scoreNumeric !== null ? `${insights.scoreNumeric}/5` : "no score",
      `${insights.dimensions.length} dims`,
      insights.comp ? "comp ✓" : "comp –",
      insights.gaps.length ? `${insights.gaps.length} gaps` : "no gaps",
    ].join("  ");

    if (dryRun) {
      log.info(`${tag} 🧪 ${summary}`);
      results.updated += 1;
      continue;
    }

    try {
      await db.application.update({
        where: { id: app.id },
        data: insightColumns(insights),
      });
      log.info(`${tag} ✅ ${summary}`);
      results.updated += 1;
    } catch (err) {
      log.error(`${tag} ❌ ${(err as Error).message}`);
      results.errors += 1;
    }
  }

  log.rule("═");
  log.info(`📊 ${results.updated} updated  ${results.skipped} skipped  ${results.errors} errors`);
}

main()
  .catch((err: unknown) => {
    log.error(`❌ Fatal: ${(err as Error).message}`);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());

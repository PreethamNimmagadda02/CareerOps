#!/usr/bin/env node
/**
 * Normalize all FilterKeyword values in Postgres to lowercase.
 *
 * The unique constraint is @@unique([userId, kind, value]), so when a
 * lower-cased twin already exists the original mixed-case row is simply
 * deleted; otherwise the row is updated in-place.
 *
 * Usage:
 *   npx tsx scripts/normalize-keywords.ts [--dry-run]
 */
import { Args } from "../src/lib/args.js";
import { db } from "../src/lib/db.js";
import { log } from "../src/lib/logger.js";

async function main(): Promise<void> {
  const dryRun = new Args().has("--dry-run");

  const all = await db.filterKeyword.findMany({
    orderBy: [{ userId: "asc" }, { kind: "asc" }, { value: "asc" }],
  });

  const needsNorm = all.filter((k) => k.value !== k.value.toLowerCase());

  log.info(
    `🔎 ${all.length} keyword(s) total; ${needsNorm.length} need normalization.`,
  );

  if (needsNorm.length === 0) {
    log.info("✅ Nothing to do.");
    return;
  }

  // Build a set of already-normalized values for fast duplicate detection.
  // Key: `${userId}|${kind}|${value}` → id
  const index = new Map<string, string>(
    all.map((k) => [`${k.userId}|${k.kind}|${k.value}`, k.id]),
  );

  let updated = 0;
  let deduped = 0;

  for (const kw of needsNorm) {
    const normalized = kw.value.toLowerCase();
    const twinKey = `${kw.userId}|${kw.kind}|${normalized}`;
    const twinExists = index.has(twinKey) && index.get(twinKey) !== kw.id;

    if (twinExists) {
      // A lowercase twin is already present — just remove the mixed-case row.
      log.info(
        `  🗑  [${kw.kind}] "${kw.value}" → duplicate of "${normalized}", deleting.`,
      );
      if (!dryRun) {
        await db.filterKeyword.delete({ where: { id: kw.id } });
      }
      deduped += 1;
    } else {
      // Safe to update in-place.
      log.info(`  ✏️  [${kw.kind}] "${kw.value}" → "${normalized}"`);
      if (!dryRun) {
        await db.filterKeyword.update({
          where: { id: kw.id },
          data: { value: normalized },
        });
      }
      // Keep the index current so later iterations see the updated value.
      index.delete(`${kw.userId}|${kw.kind}|${kw.value}`);
      index.set(twinKey, kw.id);
      updated += 1;
    }
  }

  log.info(
    `\n🏁 ${dryRun ? "[dry-run] " : ""}${updated} updated, ${deduped} duplicates removed.`,
  );
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Restore portals (global) and filter keywords (per-user) that were recovered
 * from the Postgres WAL after an accidental `prisma db push --force-reset`.
 *
 * Data sources (siblings of this script):
 *   - scripts/portals.json   → [{ name, careersUrl, api }]
 *   - scripts/keywords.json   → { positive: string[], negative: string[] }
 *
 * Usage:
 *   CAREER_OPS_USER_ID=<userId> npx tsx scripts/restore-recovered.ts [--dry-run]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { db } from "../src/lib/db.js";
import { log } from "../src/lib/logger.js";

const here = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

type PortalRow = { name: string; careersUrl: string | null; api: string | null };
type Keywords = { positive: string[]; negative: string[] };

async function main(): Promise<void> {
  const userId = process.env.CAREER_OPS_USER_ID?.trim();
  if (!userId) {
    log.error("❌ Set CAREER_OPS_USER_ID to the owning user's id.");
    process.exit(1);
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    log.error(`❌ User ${userId} not found. Sign in once to create the account first.`);
    process.exit(1);
  }
  log.info(`👤 Restoring for ${user.email ?? user.id}`);

  const portals: PortalRow[] = JSON.parse(readFileSync(join(here, "portals.json"), "utf8"));
  const keywords: Keywords = JSON.parse(readFileSync(join(here, "keywords.json"), "utf8"));

  log.info(`📦 Portals to restore (global): ${portals.length}`);
  log.info(`🔤 Keywords: ${keywords.positive.length} positive / ${keywords.negative.length} negative`);

  if (dryRun) {
    log.info("🧪 Dry-run — nothing written.");
    return;
  }

  // ── Portals (global, unique by name) ───────────────────────────────────────
  let added = 0;
  for (const p of portals) {
    if (!p.name || !p.careersUrl) continue;
    await db.portal.upsert({
      where: { name: p.name },
      update: { careersUrl: p.careersUrl, api: p.api ?? null, enabled: true },
      create: { name: p.name, careersUrl: p.careersUrl, api: p.api ?? null, enabled: true },
    });
    added += 1;
  }
  log.info(`✅ Portals upserted: ${added}`);

  // ── Filter keywords (per-user) ─────────────────────────────────────────────
  const kwRows = [
    ...keywords.positive.map((value) => ({ kind: "positive", value })),
    ...keywords.negative.map((value) => ({ kind: "negative", value })),
  ];
  let kwAdded = 0;
  for (const k of kwRows) {
    if (!k.value) continue;
    await db.filterKeyword.upsert({
      where: { userId_kind_value: { userId, kind: k.kind, value: k.value } },
      update: {},
      create: { userId, kind: k.kind, value: k.value },
    });
    kwAdded += 1;
  }
  log.info(`✅ Keywords upserted: ${kwAdded}`);

  const [portalCount, kwCount] = await Promise.all([
    db.portal.count(),
    db.filterKeyword.count({ where: { userId } }),
  ]);
  log.info(`\n🏁 Done. Portal rows: ${portalCount}, FilterKeyword rows (user): ${kwCount}`);
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

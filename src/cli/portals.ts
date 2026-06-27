#!/usr/bin/env node
/**
 * career-ops portals — manage scan targets in Postgres.
 *
 * Postgres is the single source of truth for portal configuration.
 * There is no portals.yml — add, edit, and delete portals here.
 *
 * Usage:
 *   career-ops-portals list     [--json] [--disabled]
 *   career-ops-portals count
 *   career-ops-portals add      --name "Acme" --url "https://jobs.ashbyhq.com/acme" [--api URL]
 *   career-ops-portals update   --name "Acme" [--url URL] [--api URL]
 *   career-ops-portals delete   --name "Acme"
 *   career-ops-portals enable   --name "Acme"
 *   career-ops-portals disable  --name "Acme"
 *   career-ops-portals keywords list
 *   career-ops-portals keywords add  --kind positive|negative --value "keyword"
 *   career-ops-portals keywords del  --kind positive|negative --value "keyword"
 */
import { Args } from "../lib/args.js";
import { db } from "../lib/db.js";
import { log } from "../lib/logger.js";
import { portalCount } from "../lib/portals-db.js";
import { slugFromAshby, slugFromLever } from "../lib/scanner.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function required(args: Args, name: string): string {
  const v = args.get(name);
  if (!v) { log.error(`❌ Missing required option ${name}`); process.exit(1); }
  return v;
}

function detectMethod(careersUrl?: string | null, api?: string | null): string {
  if (api) return "greenhouse-api";
  if (slugFromAshby(careersUrl ?? undefined)) return "ashby";
  if (slugFromLever(careersUrl ?? undefined)) return "lever";
  return "browser";
}

// ── sub-commands ──────────────────────────────────────────────────────────────

async function cmdList(args: Args): Promise<void> {
  const showDisabled = args.has("--disabled");
  const portals = await db.portal.findMany({
    where: showDisabled ? undefined : { enabled: true },
    orderBy: { name: "asc" },
  });
  if (args.has("--json")) {
    process.stdout.write(JSON.stringify(portals, null, 2) + "\n");
    return;
  }
  for (const p of portals) {
    const m = detectMethod(p.careersUrl, p.api);
    const flag = p.enabled ? "✓" : "✗";
    log.info(`${flag} [${p.id}] ${p.name}  [${m}]  ${p.careersUrl ?? p.api ?? "(no url)"}`);
  }
  log.info(`\n${portals.length} portal(s)${showDisabled ? "" : " (enabled)"}.`);
}

async function cmdCount(): Promise<void> {
  const [total, enabled] = await Promise.all([
    portalCount(),
    db.portal.count({ where: { enabled: true } }),
  ]);
  log.info(`${enabled} enabled / ${total} total portals in Postgres.`);
}

async function cmdAdd(args: Args): Promise<void> {
  const name = required(args, "--name");
  const existing = await db.portal.findFirst({ where: { name } });
  if (existing) { log.error(`❌ Portal "${name}" already exists (id=${existing.id}). Use update.`); process.exit(1); }
  const portal = await db.portal.create({
    data: {
      name,
      careersUrl: args.get("--url") ?? null,
      api:        args.get("--api") ?? null,
      enabled:    true,
    },
  });
  log.info(`✅ Added portal #${portal.id} — ${portal.name}  [${detectMethod(portal.careersUrl, portal.api)}]`);
}

async function cmdUpdate(args: Args): Promise<void> {
  const name = required(args, "--name");
  const portal = await db.portal.findFirst({ where: { name } });
  if (!portal) { log.error(`❌ Portal "${name}" not found.`); process.exit(1); }
  const fields: Record<string, string | null> = {};
  if (args.get("--url") !== undefined) fields.careersUrl = args.get("--url") ?? null;
  if (args.get("--api") !== undefined) fields.api        = args.get("--api") ?? null;
  if (Object.keys(fields).length === 0) { log.error("❌ Nothing to update. Pass at least one field."); process.exit(1); }
  await db.portal.update({ where: { id: portal.id }, data: fields });
  log.info(`✅ Updated portal "${name}": ${Object.keys(fields).join(", ")}`);
}

async function cmdDelete(args: Args): Promise<void> {
  const name = required(args, "--name");
  const portal = await db.portal.findFirst({ where: { name } });
  if (!portal) { log.error(`❌ Portal "${name}" not found.`); process.exit(1); }
  await db.portal.delete({ where: { id: portal.id } });
  log.info(`✅ Deleted portal "${name}" (id=${portal.id}).`);
}

async function cmdEnable(args: Args): Promise<void> {
  const name = required(args, "--name");
  const portal = await db.portal.findFirst({ where: { name } });
  if (!portal) { log.error(`❌ Portal "${name}" not found.`); process.exit(1); }
  await db.portal.update({ where: { id: portal.id }, data: { enabled: true } });
  log.info(`✅ Enabled "${name}".`);
}

async function cmdDisable(args: Args): Promise<void> {
  const name = required(args, "--name");
  const portal = await db.portal.findFirst({ where: { name } });
  if (!portal) { log.error(`❌ Portal "${name}" not found.`); process.exit(1); }
  await db.portal.update({ where: { id: portal.id }, data: { enabled: false } });
  log.info(`✅ Disabled "${name}".`);
}

async function cmdKeywords(argv: string[]): Promise<void> {
  const sub = argv[0];
  const args = new Args(argv.slice(1));
  if (sub === "list" || !sub) {
    const kws = await db.filterKeyword.findMany({ orderBy: [{ kind: "asc" }, { value: "asc" }] });
    const pos = kws.filter(k => k.kind === "positive").map(k => k.value);
    const neg = kws.filter(k => k.kind === "negative").map(k => k.value);
    log.info(`positive (${pos.length}): ${pos.join(", ")}`);
    log.info(`negative (${neg.length}): ${neg.join(", ")}`);
    return;
  }
  if (sub === "add") {
    const kind = required(args, "--kind");
    if (kind !== "positive" && kind !== "negative") { log.error('❌ --kind must be "positive" or "negative"'); process.exit(1); }
    const value = required(args, "--value");
    await db.filterKeyword.upsert({
      where: { kind_value: { kind, value } },
      update: {},
      create: { kind, value },
    });
    log.info(`✅ Added ${kind} keyword: "${value}"`);
    return;
  }
  if (sub === "del" || sub === "delete") {
    const kind = required(args, "--kind");
    const value = required(args, "--value");
    const deleted = await db.filterKeyword.deleteMany({ where: { kind, value } });
    if (deleted.count) log.info(`✅ Removed ${kind} keyword: "${value}"`);
    else log.error(`❌ Keyword "${value}" (${kind}) not found.`);
    return;
  }
  log.error(`Unknown keywords sub-command: ${sub}`);
  process.exit(1);
}

// ── router ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub  = argv[0];
  const args = new Args(argv.slice(1));

  switch (sub) {
    case "list":     await cmdList(args);           break;
    case "count":    await cmdCount();              break;
    case "add":      await cmdAdd(args);            break;
    case "update":   await cmdUpdate(args);         break;
    case "delete":   await cmdDelete(args);         break;
    case "enable":   await cmdEnable(args);         break;
    case "disable":  await cmdDisable(args);        break;
    case "keywords": await cmdKeywords(argv.slice(1)); break;
    default:
      log.error(
        "Usage: career-ops-portals <command> [options]\n\n" +
        "  list     [--json] [--disabled]          list portals\n" +
        "  count                                   total / enabled count\n" +
        "  add      --name X --url U [--api]\n" +
        "  update   --name X [--url --api]\n" +
        "  delete   --name X\n" +
        "  enable   --name X\n" +
        "  disable  --name X\n" +
        "  keywords list\n" +
        "  keywords add  --kind positive|negative --value WORD\n" +
        "  keywords del  --kind positive|negative --value WORD\n",
      );
      process.exit(sub ? 1 : 0);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

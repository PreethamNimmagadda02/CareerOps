#!/usr/bin/env node
/**
 * career-ops tracker — persist applications to Postgres and reports to MinIO.
 *
 * This is the interactive counterpart to the automated `evaluate` CLI. The agent
 * (or a human) calls it instead of editing `data/applications.md` or writing files
 * into `reports/`. Applications live in Postgres; report markdown lives in MinIO.
 *
 * Usage:
 *   career-ops-tracker list [--json]
 *   career-ops-tracker add    --company "Acme" --role "AI PM" [--score 4.5 --status Evaluada --pdf ❌ --report "" --date YYYY-MM-DD]
 *   career-ops-tracker update --id 12 [--score 4.5/5 --status Aplicado --report "[012](reports/...)" --pdf ✅ --role "..." --company "..."]
 *   career-ops-tracker save   --company "Acme" --role "AI PM" --url "https://..." [--score 4.5 --status Evaluada --pdf ❌ --provider "manual"] [--file /tmp/eval.md]
 *
 * `save` is the one-shot post-evaluation command: it uploads the report to
 * MinIO (with the canonical header) AND inserts the application row in Postgres,
 * linking the two. If `--file` is omitted it reads the evaluation body from stdin.
 */
import { readFileSync } from "node:fs";
import { AppStatus } from "@prisma/client";

import { Args } from "../lib/args.js";
import { log } from "../lib/logger.js";
import {
  addApplication,
  getApplications,
  nextReportNumber,
  patchApplication,
  reportFilename,
  writeReport,
} from "../lib/tracker.js";
import { today } from "../lib/text.js";

const MINIO_BUCKET = process.env.MINIO_BUCKET

function required(args: Args, name: string): string {
  const value = args.get(name);
  if (!value) {
    log.error(`❌ Missing required option ${name}`);
    process.exit(1);
  }
  return value;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function cmdList(args: Args): Promise<void> {
  const apps = await getApplications();
  if (args.has("--json")) {
    process.stdout.write(JSON.stringify(apps, null, 2) + "\n");
    return;
  }
  log.info("# | Date | Company | Role | Score | Status | PDF | Report");
  for (const a of apps) {
    log.info(
      [a.num, a.date, a.company, a.role, a.score, a.status, a.pdf, a.report].join(" | "),
    );
  }
  log.info(`\n${apps.length} application(s) in Postgres.`);
}

async function cmdAdd(args: Args): Promise<void> {
  const row = await addApplication({
    company: required(args, "--company"),
    role: required(args, "--role"),
    score: args.get("--score"),
    status: args.get("--status") as AppStatus | undefined,
    pdf: args.get("--pdf"),
    report: args.get("--report"),
    date: args.get("--date"),
  });
  log.info(`✅ Added application #${row.num} — ${row.company} — ${row.role} (${row.status})`);
}

async function cmdUpdate(args: Args): Promise<void> {
  const id = args.number("--id", NaN);
  if (Number.isNaN(id)) {
    log.error("❌ --id is required and must be a number");
    process.exit(1);
  }
  const fields: Record<string, any> = {};
  for (const key of ["company", "role", "score", "status", "pdf", "report"]) {
    const v = args.get(`--${key}`);
    if (v !== undefined) fields[key] = key === "status" ? (v as AppStatus) : v;
  }
  if (Object.keys(fields).length === 0) {
    log.error("❌ Nothing to update. Pass at least one field (e.g. --status Aplicado).");
    process.exit(1);
  }
  const ok = await patchApplication(id, fields);
  if (ok) log.info(`✅ Updated application #${id}: ${Object.keys(fields).join(", ")}`);
  else {
    log.error(`❌ Could not update application #${id} (not found?).`);
    process.exit(1);
  }
}

async function cmdSave(args: Args): Promise<void> {
  const company = required(args, "--company");
  const role = required(args, "--role");
  const url = required(args, "--url");
  const provider = args.string("--provider", "manual");
  const score = args.get("--score") ?? "N/A";
  const status = args.get("--status") ?? "Evaluada";
  const pdf = args.get("--pdf") ?? "❌";
  const date = args.get("--date") ?? today();

  const file = args.get("--file");
  const evaluation = file ? readFileSync(file, "utf8") : await readStdin();
  if (!evaluation.trim()) {
    log.error("❌ Empty evaluation body. Pass --file <md> or pipe markdown via stdin.");
    process.exit(1);
  }

  const reportNum = args.has("--report-num")
    ? args.number("--report-num", await nextReportNumber())
    : await nextReportNumber();

  const filename = await writeReport({
    num: reportNum,
    company,
    role,
    url,
    evaluation,
    providerLabel: provider,
  });
  log.info(`☁️  Report uploaded → MinIO / ${MINIO_BUCKET ?? "careerops"}/${filename}`);

  const padded = String(reportNum).padStart(3, "0");
  const reportLink = `[${padded}](reports/${reportFilename(reportNum, company, date)})`;
  const scoreStr = score === "N/A" ? "N/A" : score.includes("/") ? score : `${score}/5`;

  const row = await addApplication({
    company,
    role,
    score: scoreStr,
    status: status as AppStatus,
    pdf,
    report: reportLink,
    date,
  });
  log.info(
    `✅ Application #${row.num} saved to Postgres — score=${scoreStr} status=${status} report=${padded}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const args = new Args(argv.slice(1));

  switch (sub) {
    case "list":
      await cmdList(args);
      break;
    case "add":
      await cmdAdd(args);
      break;
    case "update":
      await cmdUpdate(args);
      break;
    case "save":
      await cmdSave(args);
      break;
    default:
      log.error(
        "Usage: career-ops-tracker <list|add|update|save> [options]\n" +
        "  list   [--json]\n" +
        "  add    --company X --role Y [--score --status --pdf --report --date]\n" +
        "  update --id N [--score --status --pdf --report --role --company]\n" +
        "  save   --company X --role Y --url U [--score --status --pdf --provider --file] (body via --file or stdin)",
      );
      process.exit(sub ? 1 : 0);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

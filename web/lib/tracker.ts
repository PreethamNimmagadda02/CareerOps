import { db } from "../../src/lib/db";
import { readReportSummary } from "./reports";
import { normalizeStatus } from "./status";
import type { Application } from "./types";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { repoPaths } from "./paths";

const reReportLink = /\[(\d+)\]\(([^)]+)\)/;
const reScore = /(\d+\.?\d*)\/5/;

/** Fetch applications from the database and map to UI `Application` format. */
export async function readApplications(enrich = true): Promise<Application[]> {
  const dbApps = await db.application.findMany({
    orderBy: { id: 'asc' }
  });

  const apps: Application[] = [];

  for (const app of dbApps) {
    const scoreRaw = app.score ?? "";
    const scoreMatch = scoreRaw.match(reScore);
    const status = app.status ?? "";
    const reportCell = app.report ?? "";
    const linkMatch = reportCell.match(reReportLink);

    apps.push({
      num: app.id,
      date: app.date ?? "",
      company: app.company ?? "",
      role: app.role ?? "",
      scoreRaw,
      score: scoreMatch ? parseFloat(scoreMatch[1] as string) : null,
      status,
      normStatus: normalizeStatus(status),
      hasPdf: (app.pdf ?? "").includes("✅"),
      reportNumber: linkMatch ? linkMatch[1] as string : null,
      reportPath: linkMatch ? linkMatch[2] as string : null,
      notes: app.notes ?? "",
      jobUrl: null,
    });
  }

  if (enrich) {
    for (const app of apps) {
      if (!app.reportPath) continue;
      const summary = readReportSummary(app.reportPath);
      if (!summary) continue;
      app.jobUrl = summary.url;
      app.archetype = summary.archetype;
      app.tldr = summary.tldr;
      app.remote = summary.remote;
      app.comp = summary.comp;
    }
  }

  return apps;
}

/**
 * Update an application's status in Postgres (and applications.md for redundancy).
 * Returns true when a row was updated.
 */
export async function updateApplicationStatus(opts: {
  num?: number;
  reportNumber?: string;
  newStatus: string;
}): Promise<boolean> {
  let targetId = opts.num;
  
  if (targetId === undefined && opts.reportNumber) {
    // Need to find the target ID by report number
    const apps = await db.application.findMany();
    const app = apps.find(a => a.report.includes(`[${opts.reportNumber}]`));
    if (app) targetId = app.id;
  }

  if (targetId === undefined) return false;

  let updated = false;
  try {
    await db.application.update({
      where: { id: targetId },
      data: { status: opts.newStatus, updatedAt: new Date() }
    });
    updated = true;
  } catch (err) {
    return false;
  }

  // Update applications.md redundancy if requested
  if (updated && existsSync(repoPaths.applications)) {
    const lines = readFileSync(repoPaths.applications, "utf8").split("\n");
    let fileUpdated = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] as string;
      if (!line.trim().startsWith("|")) continue;
      if (line.trim().startsWith("| #") || line.trim().startsWith("|---")) continue;

      const parts = line.split("|");
      if (parts.length < 9) continue;

      const rowNum = parseInt((parts[1] ?? "").trim(), 10);
      if (rowNum === targetId) {
        parts[6] = ` ${opts.newStatus} `;
        lines[i] = parts.join("|");
        fileUpdated = true;
        break;
      }
    }

    if (fileUpdated) writeFileSync(repoPaths.applications, lines.join("\n"));
  }

  return updated;
}

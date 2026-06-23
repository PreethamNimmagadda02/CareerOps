import { db } from "../../src/lib/db";
import { readReportSummary } from "./reports";
import { normalizeStatus } from "./status";
import type { Application } from "./types";
import { AppStatus } from "@prisma/client";

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
      jobUrl: null,
    });
  }

  if (enrich) {
    await Promise.all(
      apps.map(async (app) => {
        if (!app.reportPath) return;
        const summary = await readReportSummary(app.reportPath);
        if (!summary) return;
        app.jobUrl = summary.url;
        app.archetype = summary.archetype;
        app.tldr = summary.tldr;
        app.remote = summary.remote;
        app.comp = summary.comp;
      })
    );
  }

  return apps;
}

/**
 * Update an application's status in Postgres.
 * Returns true when a row was updated.
 */
export async function updateApplicationStatus(opts: {
  num?: number;
  reportNumber?: string;
  newStatus: AppStatus;
}): Promise<boolean> {
  let targetId = opts.num;

  if (targetId === undefined && opts.reportNumber) {
    // Resolve the target id by report number.
    const apps = await db.application.findMany();
    const app = apps.find((a) => a.report.includes(`[${opts.reportNumber}]`));
    if (app) targetId = app.id;
  }

  if (targetId === undefined) return false;

  try {
    await db.application.update({
      where: { id: targetId },
      data: { status: opts.newStatus, updatedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

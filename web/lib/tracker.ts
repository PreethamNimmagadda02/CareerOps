import { db } from "../../src/lib/db";
import { readReportSummary } from "./reports";
import { normalizeStatus } from "./status";
import type { Application, ScoreDimensionView } from "./types";
import { AppStatus } from "@prisma/client";

interface StoredInsights {
  dimensions?: ScoreDimensionView[];
  gaps?: string[];
  recommendationNote?: string | null;
}

/** Safely unwrap the `insights` JSON column. */
function readInsights(value: unknown): StoredInsights {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  return {
    dimensions: Array.isArray(v.dimensions) ? (v.dimensions as ScoreDimensionView[]) : undefined,
    gaps: Array.isArray(v.gaps) ? (v.gaps as string[]) : undefined,
    recommendationNote:
      typeof v.recommendationNote === "string" ? v.recommendationNote : undefined,
  };
}

// Leading report number from either the current filename form
// ("001-acme-….md") or the legacy markdown-link form ("[001](reports/…)").
const reReportNum = /^\[?(\d+)/;
const reScore = /(\d+\.?\d*)\/5/;

/** Fetch one user's applications from the database, mapped to UI `Application` format. */
export async function readApplications(userId: string, enrich = true): Promise<Application[]> {
  const dbApps = await db.application.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' }
  });

  const apps: Application[] = [];

  for (const app of dbApps) {
    const scoreRaw = app.score ?? "";
    const scoreMatch = scoreRaw.match(reScore);
    const status = app.status ?? "";
    const reportCell = app.reportName ?? "";
    const numMatch = reportCell.match(reReportNum);
    const stored = readInsights(app.insights);

    apps.push({
      num: app.id,
      date: app.date ?? "",
      company: app.company ?? "",
      role: app.role ?? "",
      scoreRaw,
      score: app.scoreNumeric ?? (scoreMatch ? parseFloat(scoreMatch[1] as string) : null),
      status,
      normStatus: normalizeStatus(status),
      hasPdf: (app.pdf ?? "").includes("✅"),
      reportNumber: numMatch ? (numMatch[1] as string) : null,
      // `report` now stores the MinIO object name directly.
      reportPath: reportCell || null,
      reportUrl: app.reportUrl ?? null,
      jobUrl: app.url ?? null,
      // Insights persisted at evaluate time (or by the backfill script).
      archetype: app.archetype ?? undefined,
      tldr: app.tldr ?? undefined,
      remote: app.remote ?? undefined,
      comp: app.comp ?? undefined,
      recommendation: app.recommendation ?? null,
      recommendationNote: stored.recommendationNote ?? null,
      dimensions: stored.dimensions,
      gaps: stored.gaps,
    });
  }

  // Legacy fallback: rows evaluated before insights were persisted (no
  // `evaluatedAt`) still get their summary regex-parsed from the MinIO
  // report. New/backfilled rows skip this entirely — no object reads.
  if (enrich) {
    const legacy = dbApps.filter((a) => a.reportName && !a.evaluatedAt);
    const legacyIds = new Set(legacy.map((a) => a.id));
    await Promise.all(
      apps
        .filter((app) => legacyIds.has(app.num) && app.reportPath)
        .map(async (app) => {
          const summary = await readReportSummary(userId, app.reportPath as string);
          if (!summary) return;
          app.jobUrl = app.jobUrl ?? summary.url;
          app.archetype = summary.archetype;
          app.tldr = summary.tldr;
          app.remote = summary.remote;
          app.comp = summary.comp;
        }),
    );
  }

  return apps;
}

/**
 * Update an application's status in Postgres.
 * Returns true when a row was updated.
 */
export async function updateApplicationStatus(opts: {
  userId: string;
  num?: string;
  reportNumber?: string;
  newStatus: AppStatus;
}): Promise<boolean> {
  let targetId = opts.num;

  if (targetId === undefined && opts.reportNumber) {
    // Resolve the target id by report number (scoped to this user), matching
    // either the filename form ("005-acme-….md") or the legacy markdown-link
    // form ("[005](…)").
    const wanted = parseInt(opts.reportNumber, 10);
    const apps = await db.application.findMany({ where: { userId: opts.userId } });
    const app = apps.find((a) => {
      const m = a.reportName.match(/^\[?(\d+)/);
      return m ? parseInt(m[1] as string, 10) === wanted : false;
    });
    if (app) targetId = app.id;
  }

  if (targetId === undefined) return false;

  try {
    // `updateMany` with the userId in the filter guarantees a user can only
    // ever mutate their own rows, even if they guess another row's id.
    const { count } = await db.application.updateMany({
      where: { id: targetId, userId: opts.userId },
      data: { status: opts.newStatus, updatedAt: new Date() },
    });
    return count > 0;
  } catch {
    return false;
  }
}

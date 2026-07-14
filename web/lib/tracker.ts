import { db } from "../../src/lib/db";
import { normalizeStatus } from "./status";
import type { Application, ScoreDimensionView } from "./types";
import { AppStatus } from "@prisma/client";

/** Default page size for a single applications request. */
export const APPLICATIONS_PAGE_SIZE = 200;
/** Hard cap so a client can never request an unbounded page. */
export const APPLICATIONS_MAX_PAGE_SIZE = 500;

export interface ReadApplicationsOptions {
  /** Page size (clamped to APPLICATIONS_MAX_PAGE_SIZE). */
  limit?: number;
  /** Opaque cursor — the `id` of the last row from the previous page. */
  cursor?: string | null;
}

export interface ApplicationsPage {
  applications: Application[];
  /** Pass back as `cursor` to fetch the next page; null when exhausted. */
  nextCursor: string | null;
}

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

/**
 * Fetch one page of a user's applications, mapped to the UI `Application`
 * format. Cursor-paginated on a stable (createdAt, id) ordering so the request
 * is always bounded — a power user with thousands of tracked roles no longer
 * loads the entire set into memory on every dashboard render.
 *
 * Insights (archetype / tldr / remote / comp / dimensions / gaps) are read
 * straight from the denormalized columns persisted at evaluate time. The old
 * per-row MinIO fallback for legacy rows was removed after `evaluatedAt` was
 * backfilled (scripts/backfill-evaluations.ts) — see git history — so listing
 * no longer does N object-store reads.
 */
export async function readApplications(
  userId: string,
  opts: ReadApplicationsOptions = {},
): Promise<ApplicationsPage> {
  const limit = Math.min(
    Math.max(1, Math.floor(opts.limit ?? APPLICATIONS_PAGE_SIZE)),
    APPLICATIONS_MAX_PAGE_SIZE,
  );

  // Fetch one extra row to detect whether a further page exists without a
  // second count query.
  const dbApps = await db.application.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = dbApps.length > limit;
  const pageRows = hasMore ? dbApps.slice(0, limit) : dbApps;
  const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

  const apps: Application[] = [];

  for (const app of pageRows) {
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

  return { applications: apps, nextCursor };
}

/**
 * Resolve a single application's id from a report number, scoped to one user,
 * with a targeted indexed query rather than loading the user's whole set.
 *
 * `reportName` is stored either as the filename form ("005-acme-….md") or the
 * legacy markdown-link form ("[005](…)"), so we match a small set of leading
 * prefixes. The trailing "-"/"]" prevents "5" from matching "50-…". Returns the
 * id, or null when the user has no matching report.
 */
export async function findAppIdByReportNumber(
  userId: string,
  reportNumber: number,
): Promise<string | null> {
  if (!Number.isFinite(reportNumber)) return null;
  const padded = String(reportNumber).padStart(3, "0");
  const app = await db.application.findFirst({
    where: {
      userId,
      OR: [
        { reportName: { startsWith: `${padded}-` } },
        { reportName: { startsWith: `[${padded}]` } },
        { reportName: { startsWith: `${reportNumber}-` } },
        { reportName: { startsWith: `[${reportNumber}]` } },
      ],
    },
    select: { id: true },
  });
  return app?.id ?? null;
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
    targetId =
      (await findAppIdByReportNumber(opts.userId, parseInt(opts.reportNumber, 10))) ?? undefined;
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

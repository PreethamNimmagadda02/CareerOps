import type { ApplicationRow } from "../types.js";
import { AppStatus, Prisma } from "@prisma/client";
import type { EvaluationInsights } from "./evaluation.js";
import { slugify, today } from "./text.js";
import { db } from "./db.js";
import { reportObjectUrl, uploadReport } from "./minio.js";

/** Fetch all applications belonging to one user. */
export async function getApplications(userId: string): Promise<ApplicationRow[]> {
  const apps = await db.application.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return apps.map((app) => ({
    num: app.id,
    date: app.date,
    company: app.company,
    role: app.role,
    score: app.score,
    status: app.status,
    pdf: app.pdf,
    reportName: app.reportName,
    reportUrl: app.reportUrl,
    url: app.url,
  }));
}

/**
 * Insert a new application row into Postgres.
 * Replaces the old habit of appending a markdown row to `data/applications.md`.
 * The row's `id` (autoincrement) is returned as `num`.
 */
export async function addApplication(opts: {
  userId: string;
  company: string;
  role: string;
  score?: string;
  status?: AppStatus;
  pdf?: string;
  reportName?: string;
  reportUrl?: string;
  date?: string;
}): Promise<ApplicationRow> {
  const date = opts.date ?? today();
  const app = await db.application.create({
    data: {
      userId: opts.userId,
      date,
      company: opts.company,
      role: opts.role,
      score: opts.score ?? "N/A",
      status: opts.status ?? AppStatus.Evaluated,
      pdf: opts.pdf ?? "❌",
      reportName: opts.reportName ?? "",
      reportUrl: opts.reportUrl ?? null,
    },
  });

  return {
    num: app.id,
    date: app.date,
    company: app.company,
    role: app.role,
    score: app.score,
    status: app.status,
    pdf: app.pdf,
    reportName: app.reportName,
    reportUrl: app.reportUrl,
    url: app.url,
  };
}

/**
 * Update arbitrary fields on an existing application row in Postgres.
 * Pass only the fields you want to change.
 */
export async function patchApplication(
  id: string,
  userId: string,
  fields: Partial<{
    company: string;
    role: string;
    score: string;
    status: AppStatus;
    pdf: string;
    reportName: string;
    reportUrl: string;
  }>,
): Promise<boolean> {
  try {
    const { count } = await db.application.updateMany({
      where: { id, userId },
      data: { ...fields, updatedAt: new Date() },
    });
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Allocate the next sequential report number for a single user.
 *
 * This is a per-tenant, atomic counter: a single `UPDATE … RETURNING` bumps
 * `User.reportSeq` and hands back the new value in one round-trip. Two
 * concurrent evaluations — even across separate worker processes — can never
 * receive the same number, and the query touches exactly one row (no scan).
 *
 * (The previous implementation scanned every `Application` row of *every* user
 * and computed the max in JS, which was both O(all-apps) and racy across
 * tenants — two users could be handed the same number.)
 */
export async function nextReportNumber(userId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ reportSeq: number }>>`
    UPDATE "User"
    SET "reportSeq" = "reportSeq" + 1
    WHERE id = ${userId}
    RETURNING "reportSeq"
  `;
  const next = rows[0]?.reportSeq;
  if (next == null) {
    throw new Error(`nextReportNumber: no User row for id=${userId}`);
  }
  return next;
}

/** Build the canonical report filename for a given number/company/date. */
export function reportFilename(num: number, company: string, date: string = today()): string {
  return `${String(num).padStart(3, "0")}-${slugify(company)}-${date}.md`;
}

/**
 * Upload an evaluation report directly to MinIO and return its filename.
 * No local file is written.
 */
export async function writeReport(opts: {
  userId: string;
  num: number;
  company: string;
  role: string;
  url: string;
  evaluation: string;
  providerLabel: string;
}): Promise<string> {
  const { userId, num, company, role, url, evaluation, providerLabel } = opts;
  const date = today();
  const filename = reportFilename(num, company, date);
  const content = `# Evaluation: ${company} — ${role}\n\n**Date:** ${date}\n**URL:** ${url}\n**Provider:** ${providerLabel}\n**Report #:** ${num}\n\n---\n\n${evaluation}\n`;
  await uploadReport(userId, filename, content);
  return filename;
}

/**
 * Map parsed evaluation insights to the Application columns they populate.
 * Exposed for the backfill script, which updates rows without touching the
 * report filename/score cells.
 */
export function insightColumns(insights: EvaluationInsights): Prisma.ApplicationUpdateManyMutationInput {
  return {
    scoreNumeric: insights.scoreNumeric,
    recommendation: insights.recommendation,
    archetype: insights.archetype,
    tldr: insights.tldr,
    remote: insights.remote,
    comp: insights.comp,
    // Plain JSON-serializable payload; Prisma's InputJsonValue doesn't admit
    // `null` object properties structurally, hence the through-unknown cast.
    insights: {
      dimensions: insights.dimensions,
      gaps: insights.gaps,
      recommendationNote: insights.recommendationNote,
    } as unknown as Prisma.InputJsonValue,
    evaluatedAt: new Date(),
  };
}

/**
 * Update an application's score, report filename, MinIO report URL, and —
 * when provided — the parsed evaluation insights (recommendation, dimension
 * scores, archetype, comp…), so the dashboard never has to re-read report
 * markdown to display them.
 *
 * `report` stores the exact MinIO object name (e.g. "005-acme-2026-06-16.md")
 * and `reportUrl` stores its resolvable MinIO URL.
 */
export async function updateTracker(
  id: string,
  userId: string,
  score: string,
  reportNum: number,
  company: string,
  date: string,
  insights?: EvaluationInsights,
): Promise<boolean> {
  const filename = reportFilename(reportNum, company, date);
  const reportUrl = reportObjectUrl(userId, filename);

  try {
    const { count } = await db.application.updateMany({
      where: { id, userId },
      data: {
        score: score === "N/A" ? "N/A" : `${score}/5`,
        reportName: filename,
        reportUrl,
        ...(insights ? insightColumns(insights) : {}),
        updatedAt: new Date(),
      },
    });
    return count > 0;
  } catch {
    return false;
  }
}

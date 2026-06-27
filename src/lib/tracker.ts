import type { ApplicationRow } from "../types.js";
import { AppStatus } from "@prisma/client";
import { slugify, today } from "./text.js";
import { db } from "./db.js";
import { reportObjectUrl, uploadReport } from "./minio.js";

/** Fetch all applications from the database. */
export async function getApplications(): Promise<ApplicationRow[]> {
  const apps = await db.application.findMany({
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
    await db.application.update({
      where: { id },
      data: { ...fields, updatedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}



/**
 * Compute the next sequential report number by inspecting stored report links
 * in the database. This replaces the old local-directory scan now that reports
 * are stored in MinIO.
 */
export async function nextReportNumber(): Promise<number> {
  const apps = await db.application.findMany({ select: { reportName: true } });
  let max = 0;
  for (const app of apps) {
    // Accepts both the current filename form ("001-acme-….md") and the legacy
    // markdown-link form ("[001](reports/…)") so old rows still count.
    const match = app.reportName?.match(/^\[?(\d+)/);
    if (match) {
      const n = parseInt(match[1] as string, 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
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
  num: number;
  company: string;
  role: string;
  url: string;
  evaluation: string;
  providerLabel: string;
}): Promise<string> {
  const { num, company, role, url, evaluation, providerLabel } = opts;
  const date = today();
  const filename = reportFilename(num, company, date);
  const content = `# Evaluation: ${company} — ${role}\n\n**Date:** ${date}\n**URL:** ${url}\n**Provider:** ${providerLabel}\n**Report #:** ${num}\n\n---\n\n${evaluation}\n`;
  await uploadReport(filename, content);
  return filename;
}

/**
 * Update an application's score, report filename, and MinIO report URL.
 *
 * `report` stores the exact MinIO object name (e.g. "005-acme-2026-06-16.md")
 * and `reportUrl` stores its resolvable MinIO URL.
 */
export async function updateTracker(
  id: string,
  score: string,
  reportNum: number,
  company: string,
  date: string,
): Promise<boolean> {
  const filename = reportFilename(reportNum, company, date);
  const reportUrl = reportObjectUrl(filename);

  try {
    await db.application.update({
      where: { id },
      data: {
        score: score === "N/A" ? "N/A" : `${score}/5`,
        reportName: filename,
        reportUrl,
        updatedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

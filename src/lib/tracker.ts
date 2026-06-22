import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ApplicationRow } from "../types.js";
import { paths } from "./paths.js";
import { normalizeKey, slugify, today } from "./text.js";
import { db } from "./db.js";

/** Fetch all applications from the database. */
export async function getApplications(): Promise<ApplicationRow[]> {
  const apps = await db.application.findMany({
    orderBy: { id: "asc" },
  });

  return apps.map((app) => ({
    num: app.id,
    date: app.date,
    company: app.company,
    role: app.role,
    score: app.score,
    status: app.status,
    pdf: app.pdf,
    report: app.report,
    notes: app.notes || "",
    raw: "", // Deprecated, kept for type compatibility
  }));
}

/** Build a company||title -> url index from a scan-results JSON file. */
export function buildUrlIndex(scanResultsPath: string = paths.scanResults): Map<string, string> {
  if (!existsSync(scanResultsPath)) return new Map();
  try {
    const data = JSON.parse(readFileSync(scanResultsPath, "utf8"));
    const idx = new Map<string, string>();
    for (const job of [...(data.shortlist || []), ...(data.relevant || [])]) {
      const key = normalizeKey(job.company, job.title);
      if (!idx.has(key)) idx.set(key, job.url);
    }
    return idx;
  } catch {
    return new Map();
  }
}

/** Compute the next sequential report number based on files in `reports/`. */
export function nextReportNumber(reportsDir: string = paths.reportsDir): number {
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
    return 1;
  }
  const files = readdirSync(reportsDir).filter((f) => /^\d{3}-/.test(f));
  if (!files.length) return 1;
  return Math.max(...files.map((f) => parseInt(f.split("-")[0] as string, 10))) + 1;
}

/** Build the canonical report filename for a given number/company/date. */
export function reportFilename(num: number, company: string, date: string = today()): string {
  return `${String(num).padStart(3, "0")}-${slugify(company)}-${date}.md`;
}

/** Write an evaluation report markdown file and return its filename. */
export function writeReport(opts: {
  num: number;
  company: string;
  role: string;
  url: string;
  evaluation: string;
  providerLabel: string;
  reportsDir?: string;
}): string {
  const { num, company, role, url, evaluation, providerLabel } = opts;
  const reportsDir = opts.reportsDir ?? paths.reportsDir;
  const date = today();
  const filename = reportFilename(num, company, date);
  const content = `# Evaluation: ${company} — ${role}\n\n**Date:** ${date}\n**URL:** ${url}\n**Provider:** ${providerLabel}\n**Report #:** ${num}\n\n---\n\n${evaluation}\n`;
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(path.join(reportsDir, filename), content);
  return filename;
}

/**
 * Update an application's score and report link in the database.
 */
export async function updateTracker(
  id: number,
  score: string,
  reportNum: number,
  company: string,
  date: string,
): Promise<boolean> {
  const filename = reportFilename(reportNum, company, date);
  const reportLink = `[${String(reportNum).padStart(3, "0")}](reports/${filename})`;

  try {
    await db.application.update({
      where: { id },
      data: {
        score: `${score}/5`,
        report: reportLink,
        updatedAt: new Date(),
      },
    });
    return true;
  } catch (err) {
    return false;
  }
}

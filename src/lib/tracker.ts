import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ApplicationRow } from "../types.js";
import { paths } from "./paths.js";
import { normalizeKey, slugify, today } from "./text.js";

/** Parse the markdown table rows of `data/applications.md`. */
export function parseAppLines(md: string): ApplicationRow[] {
  const jobs: ApplicationRow[] = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 9) continue;
    const num = parseInt(parts[1] as string, 10);
    if (Number.isNaN(num) || num === 0) continue;
    jobs.push({
      num,
      date: parts[2] as string,
      company: parts[3] as string,
      role: parts[4] as string,
      score: parts[5] as string,
      status: parts[6] as string,
      pdf: parts[7] as string,
      report: parts[8] as string,
      notes: parts[9] || "",
      raw: line,
    });
  }
  return jobs;
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
 * Update a tracker row in-place (mutating `mdLines`) with a score + report
 * link. Returns true when the row was found and updated.
 */
export function updateTracker(
  mdLines: string[],
  rawLine: string,
  score: string,
  reportNum: number,
  company: string,
  date: string,
): boolean {
  const filename = reportFilename(reportNum, company, date);
  const reportLink = `[${String(reportNum).padStart(3, "0")}](reports/${filename})`;
  const idx = mdLines.indexOf(rawLine);
  if (idx === -1) return false;
  const parts = rawLine.split("|");
  parts[5] = ` ${score}/5 `;
  parts[8] = ` ${reportLink} `;
  mdLines[idx] = parts.join("|");
  return true;
}

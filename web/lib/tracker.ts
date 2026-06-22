import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { repoPaths } from "./paths";
import { readReportSummary } from "./reports";
import { normalizeStatus } from "./status";
import type { Application } from "./types";

const reReportLink = /\[(\d+)\]\(([^)]+)\)/;
const reScore = /(\d+\.?\d*)\/5/;

/** Parse the markdown table rows of data/applications.md into Applications. */
export function readApplications(enrich = true): Application[] {
  if (!existsSync(repoPaths.applications)) return [];
  const content = readFileSync(repoPaths.applications, "utf8");
  const apps: Application[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (trimmed.startsWith("| #") || trimmed.startsWith("|---")) continue;

    const parts = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
    if (parts.length < 8) continue;

    const num = parseInt(parts[0], 10);
    if (Number.isNaN(num) || num === 0) continue;

    const scoreRaw = parts[4] ?? "";
    const scoreMatch = scoreRaw.match(reScore);
    const status = parts[5] ?? "";

    const reportCell = parts[7] ?? "";
    const linkMatch = reportCell.match(reReportLink);

    apps.push({
      num,
      date: parts[1] ?? "",
      company: parts[2] ?? "",
      role: parts[3] ?? "",
      scoreRaw,
      score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
      status,
      normStatus: normalizeStatus(status),
      hasPdf: (parts[6] ?? "").includes("✅"),
      reportNumber: linkMatch ? linkMatch[1] : null,
      reportPath: linkMatch ? linkMatch[2] : null,
      notes: parts[8] ?? "",
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
 * Update an application's status in applications.md, matching by report number
 * (preferred) or row number. Returns true when a row was updated.
 */
export function updateApplicationStatus(opts: {
  num?: number;
  reportNumber?: string;
  newStatus: string;
}): boolean {
  if (!existsSync(repoPaths.applications)) return false;
  const lines = readFileSync(repoPaths.applications, "utf8").split("\n");
  let updated = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) continue;
    if (line.trim().startsWith("| #") || line.trim().startsWith("|---")) continue;

    const parts = line.split("|");
    // parts: ["", " # ", " date ", " company ", " role ", " score ", " status ", " pdf ", " report ", " notes "]
    if (parts.length < 9) continue;

    const rowNum = parseInt((parts[1] ?? "").trim(), 10);
    const reportCell = parts[8] ?? "";
    const matchByReport =
      opts.reportNumber && reportCell.includes(`[${opts.reportNumber}]`);
    const matchByNum = opts.num !== undefined && rowNum === opts.num;

    if (matchByReport || matchByNum) {
      parts[6] = ` ${opts.newStatus} `;
      lines[i] = parts.join("|");
      updated = true;
      break;
    }
  }

  if (updated) writeFileSync(repoPaths.applications, lines.join("\n"));
  return updated;
}

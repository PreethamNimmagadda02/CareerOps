import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { repoPaths } from "./paths";
import type { ReportPayload } from "./types";

const reUrl = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/m;
const reProvider = /^\*\*Provider:\*\*\s*(.+)$/m;
const reDate = /^\*\*Date:\*\*\s*(.+)$/m;
const reTitle = /^#\s*Evaluation:\s*(.+?)\s+[—-]\s+(.+)$/m;

// Table-cell extraction: | **Field** | value |
function tableField(text: string, field: string): string | undefined {
  const re = new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : undefined;
}

export interface ReportSummary {
  url: string | null;
  provider: string | null;
  date: string | null;
  company: string | null;
  role: string | null;
  archetype?: string;
  tldr?: string;
  remote?: string;
  comp?: string;
}

/** Read a report's lightweight summary (header + a few table fields). */
export function readReportSummary(reportRelPath: string): ReportSummary | null {
  const full = path.join(repoPaths.root, reportRelPath);
  if (!existsSync(full)) return null;
  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    return null;
  }
  const head = text.slice(0, 4000);

  const title = head.match(reTitle);
  let comp = tableField(head, "Comp");
  if (!comp) comp = tableField(head, "Compensation");

  return {
    url: head.match(reUrl)?.[1] ?? null,
    provider: head.match(reProvider)?.[1]?.trim() ?? null,
    date: head.match(reDate)?.[1]?.trim() ?? null,
    company: title?.[1]?.trim() ?? null,
    role: title?.[2]?.trim() ?? null,
    archetype: tableField(head, "Archetype"),
    tldr: tableField(head, "TL;DR"),
    remote: tableField(head, "Remote"),
    comp,
  };
}

/** Read a full report by its number (e.g. "030"), returning markdown + header. */
export function readReportByNumber(num: string): ReportPayload | null {
  const dir = repoPaths.reportsDir;
  if (!existsSync(dir)) return null;
  const padded = num.padStart(3, "0");
  const file = readdirSync(dir).find((f) => f.startsWith(`${padded}-`) && f.endsWith(".md"));
  if (!file) return null;

  const rel = path.join("reports", file);
  const markdown = readFileSync(path.join(dir, file), "utf8");
  const summary = readReportSummary(rel);

  return {
    number: padded,
    path: rel,
    absolutePath: path.join(dir, file),
    company: summary?.company ?? "",
    role: summary?.role ?? "",
    markdown,
    url: summary?.url ?? null,
    provider: summary?.provider ?? null,
    date: summary?.date ?? null,
  };
}

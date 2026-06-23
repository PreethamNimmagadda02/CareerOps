/** Shared types for the web dashboard (mirrors the tracker + report formats). */

export interface Application {
  num: number;
  date: string;
  company: string;
  role: string;
  /** Raw score cell, e.g. "4.2/5" or "N/A". */
  scoreRaw: string;
  /** Parsed numeric score, or null when unscored. */
  score: number | null;
  status: string;
  /** Normalized canonical status (e.g. "evaluated", "applied"). */
  normStatus: string;
  hasPdf: boolean;
  reportNumber: string | null;
  reportPath: string | null;
  jobUrl: string | null;
  /** Lightweight enrichment pulled from the report header/summary. */
  archetype?: string;
  tldr?: string;
  remote?: string;
  comp?: string;
}

export interface Metrics {
  total: number;
  byStatus: Record<string, number>;
  avgScore: number;
  topScore: number;
  withPdf: number;
  actionable: number;
  scored: number;
}

export interface ReportPayload {
  number: string;
  path: string;
  absolutePath: string;
  company: string;
  role: string;
  markdown: string;
  url: string | null;
  provider: string | null;
  date: string | null;
}

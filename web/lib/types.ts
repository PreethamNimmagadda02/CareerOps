/** Shared types for the web dashboard (mirrors the tracker + report formats). */

export interface Application {
  /** UUID primary key (`Application.id`). */
  num: string;
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
  reportUrl: string | null;
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

/** The four sequential gates a user clears to activate the pipeline. */
export type OnboardingStep = "profile" | "keywords" | "scan" | "evaluate";

/**
 * Progress across the activation funnel, computed server-side so the dashboard
 * can surface a single "do this next" action in one request.
 */
export interface OnboardingState {
  /** Profile + CV have the minimum fields required to evaluate. */
  profile: { done: boolean; missing: string[] };
  /** At least one positive ("Include") title keyword exists. */
  keywords: { done: boolean; count: number };
  /** At least one role has been discovered (count = total roles). */
  scan: { done: boolean; count: number };
  /** At least one role has been scored (count = evaluated roles). */
  evaluate: { done: boolean; count: number };
  /** The first incomplete step, or "done" when fully set up. */
  nextStep: OnboardingStep | "done";
  /** True when every step is complete. */
  complete: boolean;
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

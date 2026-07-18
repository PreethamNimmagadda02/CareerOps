/**
 * Parse the pipeline's rolling plain-text `log` (the only progress signal the
 * job API exposes — there is no structured payload) into the handful of real
 * numbers the onboarding scan screen renders live.
 *
 * We only ever surface counts the CLIs actually print, so the telemetry never
 * shows a fabricated figure. Lines matched (from src/cli/scan.ts, evaluate.ts):
 *   📚 Matching against {n} active postings ...
 *   📊 {total} postings → {relevant} relevant, {shortlist} high-signal (...)
 *   📊 Score: {n}/5
 *   📊 {evaluated} evaluated  {skipped} skipped  {errors} errors
 */
export interface ScanTelemetry {
  /** Active postings in the corpus the scan matched against. */
  corpus: number | null;
  /** Total postings considered this run. */
  total: number | null;
  /** Postings that passed relevance filtering. */
  relevant: number | null;
  /** High-signal shortlist size. */
  shortlist: number | null;
  /** How many roles have been scored so far (counted `Score: n/5` lines). */
  scored: number;
  /** Highest score seen so far, or null before any score lands. */
  topScore: number | null;
  /** Final evaluated count from the summary line, once printed. */
  evaluated: number | null;
  /**
   * Items completed so far in the run's slow per-item phase (scan's URL
   * validation, or evaluate's per-job loop), from the last `Progress:
   * n/total` line. Null before any such line has appeared (e.g. during
   * scan's instant matching phase, or when there's nothing to process).
   */
  progressDone: number | null;
  /** The denominator for `progressDone`. Null under the same conditions. */
  progressTotal: number | null;
}

export function parseScanTelemetry(log: string): ScanTelemetry {
  const t: ScanTelemetry = {
    corpus: null,
    total: null,
    relevant: null,
    shortlist: null,
    scored: 0,
    topScore: null,
    evaluated: null,
    progressDone: null,
    progressTotal: null,
  };
  if (!log) return t;

  const corpus = log.match(/Matching against\s+(\d+)\s+active postings/);
  if (corpus) t.corpus = Number(corpus[1]);

  const funnel = log.match(/(\d+)\s+postings\s*→\s*(\d+)\s+relevant,\s*(\d+)\s+high-signal/);
  if (funnel) {
    t.total = Number(funnel[1]);
    t.relevant = Number(funnel[2]);
    t.shortlist = Number(funnel[3]);
  }

  const scores = [...log.matchAll(/Score:\s*([\d.]+)\s*\/\s*5/g)];
  t.scored = scores.length;
  for (const m of scores) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v) && (t.topScore === null || v > t.topScore)) t.topScore = v;
  }

  const summary = log.match(/(\d+)\s+evaluated\s+(\d+)\s+skipped\s+(\d+)\s+errors/);
  if (summary) t.evaluated = Number(summary[1]);

  const progressMatches = [...log.matchAll(/Progress:\s*(\d+)\/(\d+)/g)];
  if (progressMatches.length) {
    const last = progressMatches[progressMatches.length - 1] as RegExpMatchArray;
    t.progressDone = Number(last[1]);
    t.progressTotal = Number(last[2]);
  }

  return t;
}

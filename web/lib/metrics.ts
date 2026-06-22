import { normalizeStatus } from "./status";
import type { Application, Metrics } from "./types";

/** Compute aggregate pipeline metrics from a list of applications. */
export function computeMetrics(apps: Application[]): Metrics {
  const byStatus: Record<string, number> = {};
  let totalScore = 0;
  let scored = 0;
  let topScore = 0;
  let withPdf = 0;
  let actionable = 0;

  for (const app of apps) {
    const status = normalizeStatus(app.status);
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    if (app.score !== null && app.score > 0) {
      totalScore += app.score;
      scored += 1;
      if (app.score > topScore) topScore = app.score;
    }
    if (app.hasPdf) withPdf += 1;
    if (status !== "skip" && status !== "rejected" && status !== "discarded") actionable += 1;
  }

  return {
    total: apps.length,
    byStatus,
    avgScore: scored > 0 ? totalScore / scored : 0,
    topScore,
    withPdf,
    actionable,
    scored,
  };
}

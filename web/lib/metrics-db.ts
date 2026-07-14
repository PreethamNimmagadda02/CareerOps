import { db } from "../../src/lib/db";
import { AppStatus } from "@prisma/client";
import type { Metrics, TabCounts } from "./types";

/**
 * Server-side metrics aggregation.
 *
 * The dashboard used to load a user's *entire* application set into memory and
 * compute every stat in JS (see the now-removed client `computeMetrics(apps)`).
 * That made the metrics cards O(all-user-rows) and — once the list is
 * paginated — simply wrong (a page can't see rows it didn't load).
 *
 * These aggregates run in Postgres: a single `groupBy` for the status
 * breakdown plus a handful of counts, so the cost is O(distinct-statuses),
 * independent of how many applications a user has. Because `Application.status`
 * is a DB enum, the enum→normalized mapping below is exact and avoids
 * re-implementing the fuzzy `normalizeStatus` string parser in SQL.
 */

const ENUM_TO_NORM: Record<AppStatus, string> = {
  [AppStatus.Evaluated]: "evaluated",
  [AppStatus.Applied]: "applied",
  [AppStatus.Responded]: "responded",
  [AppStatus.Interview]: "interview",
  [AppStatus.Offer]: "offer",
  [AppStatus.Rejected]: "rejected",
  [AppStatus.Discarded]: "discarded",
  [AppStatus.SKIP]: "skip",
};

export interface DashboardMetrics {
  metrics: Metrics;
  tabCounts: TabCounts;
}

// The client (`web/lib/tracker.ts`'s `readApplications`) resolves a row's
// display score as `scoreNumeric ?? parseFloat(legacy "score" string match)`
// — rows written by scripts/backfill-scores.ts or `updateTracker` without
// insights only ever get the legacy string set. The COALESCE below mirrors that
// exact fallback so tab badge counts (SQL) can't diverge from the actual
// filtered rows the dashboard renders (client `inTab`, dashboard.tsx). It is
// inlined into each query rather than shared via a `Prisma.sql` fragment: a
// nested fragment is bound as a parameter (not composed) under this client, so
// interpolating one raises `22P02`. The `\\d` escapes must be doubled to
// survive the JS template literal and reach Postgres as a real regex.

export async function readDashboardMetrics(userId: string): Promise<DashboardMetrics> {
  const [byStatusGroups, scoreAgg, pdfCount, applyCountRows, evaluatedTabCountRows] =
    await Promise.all([
      db.application.groupBy({
        by: ["status"],
        where: { userId },
        _count: { _all: true },
      }),
      db.application.aggregate({
        where: { userId, scoreNumeric: { gt: 0 } },
        _avg: { scoreNumeric: true },
        _max: { scoreNumeric: true },
        _count: { _all: true },
      }),
      db.application.count({ where: { userId, pdf: { contains: "✅" } } }),
      // "Apply now" tab: not skipped, and either an explicit APPLY_NOW verdict
      // or (no verdict yet) a strong effective score ≥ 4 — the SQL form of
      // dashboard `inTab`, legacy-score fallback included.
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM "Application"
        WHERE "userId" = ${userId} AND status <> 'SKIP'::"AppStatus"
          AND (
            recommendation = 'APPLY_NOW'
            OR (recommendation IS NULL
                AND COALESCE("scoreNumeric", (substring(score from '(\\d+\\.?\\d*)/5'))::float) >= 4)
          )
      `,
      // "Evaluated" tab: an Evaluated row that actually has a score or verdict.
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM "Application"
        WHERE "userId" = ${userId} AND status = 'Evaluated'::"AppStatus"
          AND (COALESCE("scoreNumeric", (substring(score from '(\\d+\\.?\\d*)/5'))::float) IS NOT NULL
               OR recommendation IS NOT NULL)
      `,
    ]);
  const applyCount = Number(applyCountRows[0]?.count ?? 0n);
  const evaluatedTabCount = Number(evaluatedTabCountRows[0]?.count ?? 0n);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const g of byStatusGroups) {
    const norm = ENUM_TO_NORM[g.status] ?? String(g.status).toLowerCase();
    byStatus[norm] = (byStatus[norm] ?? 0) + g._count._all;
    total += g._count._all;
  }

  const nonActionable =
    (byStatus.skip ?? 0) + (byStatus.rejected ?? 0) + (byStatus.discarded ?? 0);

  const metrics: Metrics = {
    total,
    byStatus,
    avgScore: scoreAgg._avg.scoreNumeric ?? 0,
    topScore: scoreAgg._max.scoreNumeric ?? 0,
    withPdf: pdfCount,
    actionable: total - nonActionable,
    scored: scoreAgg._count._all,
  };

  const tabCounts: TabCounts = {
    all: total,
    apply: applyCount,
    evaluated: evaluatedTabCount,
    applied: byStatus.applied ?? 0,
    interview: byStatus.interview ?? 0,
    skip: byStatus.skip ?? 0,
  };

  return { metrics, tabCounts };
}

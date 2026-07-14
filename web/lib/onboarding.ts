import { db } from "../../src/lib/db";
import { getProfile } from "../../src/lib/profile-store";
import { getCV } from "../../src/lib/cv-store";
import { validateCandidateReadiness } from "../../src/lib/profile-validation";
import type { OnboardingState, OnboardingStep } from "./types";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Compute the user's activation progress in a single round-trip.
 *
 * The pipeline has a real dependency chain (profile + keywords → scan →
 * evaluate). Surfacing it as four gates lets the dashboard show exactly one
 * "do this next" action instead of letting users discover prerequisites by
 * triggering a pre-flight failure.
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [profile, cv, positiveKeywords, totalRoles, evaluatedRoles, strongRows, scoreAgg] =
    await Promise.all([
      safe(() => getProfile(userId)),
      safe(() => getCV(userId)),
      db.filterKeyword.count({ where: { userId, kind: "positive" } }),
      db.application.count({ where: { userId } }),
      // Scores are stored as strings like "4.2/5"; "/5" reliably marks a scored row.
      db.application.count({ where: { userId, score: { contains: "/5" } } }),
      // "Cleared the bar": an explicit strong verdict, or (no verdict yet) an
      // effective score ≥ 4 — and never a SKIP. Same shape as the dashboard's
      // "Apply now" tab, widened to include APPLY_WITH_TWEAKS near-misses.
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM "Application"
        WHERE "userId" = ${userId} AND status <> 'SKIP'::"AppStatus"
          AND (
            recommendation IN ('APPLY_NOW', 'APPLY_WITH_TWEAKS')
            OR (recommendation IS NULL
                AND COALESCE("scoreNumeric", (substring(score from '(\\d+\\.?\\d*)/5'))::float) >= 4)
          )
      `,
      db.application.aggregate({
        where: { userId, scoreNumeric: { gt: 0 } },
        _max: { scoreNumeric: true },
      }),
    ]);

  const readiness = validateCandidateReadiness(profile, cv);

  const strongMatches = Number(strongRows[0]?.count ?? 0n);
  const topScore = scoreAgg._max.scoreNumeric ?? null;

  const profileDone = readiness.ok;
  const keywordsDone = positiveKeywords > 0;
  const scanDone = totalRoles > 0;
  const evaluateDone = evaluatedRoles > 0;

  let nextStep: OnboardingStep | "done" = "done";
  if (!profileDone) nextStep = "profile";
  else if (!keywordsDone) nextStep = "keywords";
  else if (!scanDone) nextStep = "scan";
  else if (!evaluateDone) nextStep = "evaluate";

  return {
    profile: { done: profileDone, missing: readiness.missing },
    keywords: { done: keywordsDone, count: positiveKeywords },
    scan: { done: scanDone, count: totalRoles },
    evaluate: { done: evaluateDone, count: evaluatedRoles, strong: strongMatches },
    topScore,
    nextStep,
    complete: nextStep === "done",
  };
}

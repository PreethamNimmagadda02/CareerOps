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
 * Whether the user has finished the guided onboarding flow at least once.
 *
 * This is the ONLY source of truth for the command-center gate. It is a
 * persisted, one-way marker (`User.onboardedAt`) — deliberately decoupled from
 * the live pipeline state below. Normal usage (running fresh scans/evaluates
 * from the dashboard) changes the derived `getOnboardingState`, but must never
 * send a returning user back into onboarding, so routing gates on this instead.
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { onboardedAt: true },
  });
  return Boolean(user?.onboardedAt);
}

/**
 * Mark onboarding as complete (idempotent). Stamps `onboardedAt` the first time
 * only, so the "onboarded on" date is stable across repeat calls.
 */
export async function markOnboardingComplete(userId: string): Promise<void> {
  await db.user.updateMany({
    where: { id: userId, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
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
  // "Done" means EVERY scanned role has a real score, not just one — otherwise
  // the progress bar (and a stale/killed evaluate job's own exit) would read
  // a batch that's 1/50 through as fully complete. See evaluate.ts's own
  // `isComplete` check, which this mirrors: a role only counts once it has a
  // parseable numeric score.
  const evaluateDone = scanDone && evaluatedRoles >= totalRoles;

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

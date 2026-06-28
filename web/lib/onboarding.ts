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
  const [profile, cv, positiveKeywords, totalRoles, evaluatedRoles] = await Promise.all([
    safe(() => getProfile(userId)),
    safe(() => getCV(userId)),
    db.filterKeyword.count({ where: { userId, kind: "positive" } }),
    db.application.count({ where: { userId } }),
    // Scores are stored as strings like "4.2/5"; "/5" reliably marks a scored row.
    db.application.count({ where: { userId, score: { contains: "/5" } } }),
  ]);

  const readiness = validateCandidateReadiness(profile, cv);

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
    evaluate: { done: evaluateDone, count: evaluatedRoles },
    nextStep,
    complete: nextStep === "done",
  };
}

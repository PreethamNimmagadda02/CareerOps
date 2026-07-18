import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/session";
import { getOnboardingState, hasCompletedOnboarding } from "@/lib/onboarding";
import { latestActiveJobForUser } from "../../../../src/lib/jobs";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import type { PipelineCommand } from "@/lib/pipeline";

export const metadata = { title: "Get set up" };

/**
 * The guided activation flow (résumé → find → score → matches).
 *
 * Onboarding is a one-way door. Once the user has finished it (persisted via
 * `User.onboardedAt`), this route redirects to the command center and never
 * shows the flow again — normal usage (scans/evaluates) lives entirely on `/`.
 *
 * While NOT yet onboarded it is a deliberate, sticky flow: we do not auto-skip
 * steps, so a refresh or cold reopen resumes at the *exact* step the user left
 * off (server truth via `phaseFor`, plus an in-flight scan re-attaching through
 * the pipeline provider). The only way out is the explicit "Go to my command
 * center" action, which marks onboarding complete.
 */
export default async function OnboardingPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  // Already onboarded → straight to the command center; never re-enter the flow.
  if (await hasCompletedOnboarding(userId)) redirect("/");

  const [state, activeJob] = await Promise.all([
    getOnboardingState(userId),
    latestActiveJobForUser(userId),
  ]);

  // A still-running scan/evaluate job means the score step is in progress. Pass
  // it through so a refresh mid-scoring resumes ON the score step instead of
  // jumping to the reveal just because the first role happens to be scored.
  return (
    <OnboardingFlow
      initial={state}
      activeCommand={(activeJob?.command as PipelineCommand | undefined) ?? null}
    />
  );
}

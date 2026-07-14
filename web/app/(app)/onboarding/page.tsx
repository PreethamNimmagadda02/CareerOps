import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { latestActiveJobForUser } from "../../../../src/lib/jobs";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import type { PipelineCommand } from "@/lib/pipeline";

export const metadata = { title: "Get set up" };

/**
 * The guided activation flow (résumé → find → score → matches).
 *
 * A deliberate, sticky flow: we do NOT auto-redirect away, so a refresh or a
 * cold reopen resumes at the *exact* step the user left off (server truth via
 * `phaseFor`, plus an in-flight scan re-attaching through the pipeline
 * provider) — never bypassing a step and never skipping the payoff. The only
 * way out is the explicit "Go to my command center" action once complete.
 *
 * The command-center gate lives on `/` (redirects here until onboarding is
 * fully complete), so the user can't reach it early — this route just resumes.
 */
export default async function OnboardingPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

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

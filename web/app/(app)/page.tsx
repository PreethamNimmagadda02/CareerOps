import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { Dashboard } from "@/components/dashboard";

/**
 * The command center — reachable ONLY once onboarding is fully complete
 * (profile → keywords → scan → evaluate all done). Until then every attempt to
 * reach it is redirected back into the guided flow. This runs server-side
 * before any render, so the gate cannot be bypassed by refreshing, deep-linking,
 * or client-side navigation. `/onboarding` deliberately does not redirect back,
 * so the two routes can't loop and the flow resumes exactly where it left off.
 */
export default async function Home() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  const state = await getOnboardingState(userId);
  if (!state.complete) redirect("/onboarding");

  return <Dashboard />;
}

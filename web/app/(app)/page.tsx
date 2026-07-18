import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/session";
import { hasCompletedOnboarding } from "@/lib/onboarding";
import { Dashboard } from "@/components/dashboard";

/**
 * The command center — reachable once the user has finished onboarding ONCE.
 *
 * The gate is a persisted, one-way marker (`User.onboardedAt`), NOT the live
 * pipeline state. Onboarding and normal usage are fully separate: after the
 * flow is done we never route back into it, so running fresh scans/evaluates
 * from the dashboard (which transiently leaves roles unevaluated) can't bounce
 * the user back. This runs server-side before render, so the gate can't be
 * bypassed by refreshing, deep-linking, or client-side navigation.
 */
export default async function Home() {
  const userId = await requireUserId();
  if (!userId) redirect("/login");

  if (!(await hasCompletedOnboarding(userId))) redirect("/onboarding");

  return <Dashboard />;
}

import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/session";
import {
  getOnboardingState,
  hasCompletedOnboarding,
  markOnboardingComplete,
} from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [onboarding, onboarded] = await Promise.all([
      getOnboardingState(userId),
      hasCompletedOnboarding(userId),
    ]);
    return NextResponse.json({ onboarding, onboarded });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Mark the guided onboarding flow as complete for the signed-in user. Called
 * when the user leaves the flow for the command center. Idempotent and gated on
 * having actually finished the funnel, so a client can't unlock the dashboard
 * early by POSTing directly.
 */
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const state = await getOnboardingState(userId);
    if (!state.complete) {
      return NextResponse.json(
        { error: "Onboarding is not complete yet", onboarding: state },
        { status: 422 },
      );
    }
    await markOnboardingComplete(userId);
    return NextResponse.json({ onboarded: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

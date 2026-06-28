import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const onboarding = await getOnboardingState(userId);
    return NextResponse.json({ onboarding });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

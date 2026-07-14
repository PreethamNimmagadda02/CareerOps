import { NextResponse } from "next/server";

import { readDashboardMetrics } from "@/lib/metrics-db";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Aggregated in SQL — no longer loads the user's full application set.
    const { metrics, tabCounts } = await readDashboardMetrics(userId);
    return NextResponse.json({ metrics, tabCounts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

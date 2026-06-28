import { NextResponse } from "next/server";

import { computeMetrics } from "@/lib/metrics";
import { requireUserId } from "@/lib/session";
import { readApplications } from "@/lib/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const apps = await readApplications(userId, false);
    return NextResponse.json({ metrics: computeMetrics(apps) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { computeMetrics } from "@/lib/metrics";
import { readApplications } from "@/lib/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apps = readApplications(false);
    return NextResponse.json({ metrics: computeMetrics(apps) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

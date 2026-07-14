import { NextResponse } from "next/server";

import { readReportByNumber } from "@/lib/reports";
import { requireUserId } from "@/lib/session";
import { findAppIdByReportNumber } from "@/lib/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ num: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { num } = await params;

    // Ownership check: only return a report the signed-in user actually has an
    // application for. This prevents enumerating other users' reports by number.
    // Targeted indexed lookup — no longer loads the user's whole application set.
    const owns = (await findAppIdByReportNumber(userId, parseInt(num, 10))) !== null;
    if (!owns) {
      return NextResponse.json({ error: `Report ${num} not found` }, { status: 404 });
    }

    const report = await readReportByNumber(userId, num);
    if (!report) {
      return NextResponse.json({ error: `Report ${num} not found` }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

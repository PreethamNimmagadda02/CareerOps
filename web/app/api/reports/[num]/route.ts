import { NextResponse } from "next/server";

import { readReportByNumber } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ num: string }> },
) {
  try {
    const { num } = await params;
    const report = await readReportByNumber(num);
    if (!report) {
      return NextResponse.json({ error: `Report ${num} not found` }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

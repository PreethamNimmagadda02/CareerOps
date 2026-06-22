import { NextResponse } from "next/server";

import { readApplications, updateApplicationStatus } from "@/lib/tracker";
import { STATUS_OPTIONS } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const applications = readApplications();
    return NextResponse.json({ applications });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      num?: number;
      reportNumber?: string;
      newStatus?: string;
    };

    if (!body.newStatus) {
      return NextResponse.json({ error: "newStatus is required" }, { status: 400 });
    }
    if (!(STATUS_OPTIONS as readonly string[]).includes(body.newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Allowed: ${STATUS_OPTIONS.join(", ")}` },
        { status: 400 },
      );
    }
    if (body.num === undefined && !body.reportNumber) {
      return NextResponse.json(
        { error: "Provide either num or reportNumber" },
        { status: 400 },
      );
    }

    const ok = updateApplicationStatus({
      num: body.num,
      reportNumber: body.reportNumber,
      newStatus: body.newStatus,
    });

    if (!ok) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

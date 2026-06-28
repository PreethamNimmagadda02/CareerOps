import { NextResponse } from "next/server";

import { db } from "../../../../../src/lib/db";
import { requireUserId } from "@/lib/session";
import {
  deleteResume,
  downloadResume,
  extFromMime,
  RESUME_MAX_BYTES,
  uploadResume,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** POST /api/profile/resume — upload a resume file (multipart/form-data, field: "file") */
export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file field is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF and Word documents are supported" },
        { status: 400 },
      );
    }
    if (file.size > RESUME_MAX_BYTES) {
      return NextResponse.json(
        { error: `File must be under ${RESUME_MAX_BYTES / 1024 / 1024} MB` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extFromMime(file.type);
    const resumeKey = await uploadResume(userId, buffer, file.type, ext);
    const resumeUpdatedAt = new Date();

    await db.user.update({
      where: { id: userId },
      data: { resumeKey, resumeUpdatedAt, updatedAt: resumeUpdatedAt },
    });

    return NextResponse.json({ resumeKey, resumeUpdatedAt });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** GET /api/profile/resume — download the user's current resume */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { resumeKey: true },
    });

    if (!user?.resumeKey) {
      return NextResponse.json({ error: "No resume uploaded" }, { status: 404 });
    }

    const result = await downloadResume(user.resumeKey);
    if (!result) {
      return NextResponse.json({ error: "Resume file not found in storage" }, { status: 404 });
    }

    const filename = `resume.${user.resumeKey.split(".").pop() ?? "pdf"}`;

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(result.buffer.length),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** DELETE /api/profile/resume — remove the user's resume */
export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { resumeKey: true },
    });

    if (user?.resumeKey) {
      await deleteResume(user.resumeKey);
    }

    await db.user.update({
      where: { id: userId },
      data: { resumeKey: null, resumeUpdatedAt: null, updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

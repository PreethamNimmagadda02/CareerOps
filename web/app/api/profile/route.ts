import { NextResponse } from "next/server";

import { db } from "../../../../src/lib/db";
import { getProfile, patchProfile } from "../../../../src/lib/profile-store";
import { getCV, patchCV } from "../../../../src/lib/cv-store";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeGetProfile(userId: string) {
  try { return await getProfile(userId); } catch { return null; }
}

async function safeGetCV(userId: string) {
  try { return await getCV(userId); } catch { return null; }
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [user, profile, cv] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true, resumeKey: true, resumeUpdatedAt: true },
      }),
      safeGetProfile(userId),
      safeGetCV(userId),
    ]);

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user, profile, cv });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      name?: string;
      profile?: Record<string, unknown>;
      cv?: Record<string, unknown>;
    };

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      await db.user.update({
        where: { id: userId },
        data: { name: trimmed || null, updatedAt: new Date() },
      });
    }

    if (body.profile && typeof body.profile === "object") {
      await patchProfile(userId, body.profile as Parameters<typeof patchProfile>[1]);
    }

    if (body.cv && typeof body.cv === "object") {
      await patchCV(userId, body.cv as Parameters<typeof patchCV>[1]);
    }

    const [user, profile, cv] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true, resumeKey: true, resumeUpdatedAt: true },
      }),
      safeGetProfile(userId),
      safeGetCV(userId),
    ]);

    return NextResponse.json({ user, profile, cv });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

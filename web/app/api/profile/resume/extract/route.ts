import { NextResponse } from "next/server";

import { db } from "../../../../../../src/lib/db";
import { getProfile, patchProfile } from "../../../../../../src/lib/profile-store";
import { getCV, patchCV } from "../../../../../../src/lib/cv-store";
import { requireUserId } from "@/lib/session";
import { downloadResume } from "@/lib/storage";
import { extractResumeText, fillEmpty, structureResume } from "@/lib/resume-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Resume parsing + an LLM round-trip can take a while.
export const maxDuration = 120;

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

/**
 * POST /api/profile/resume/extract
 * Parses the user's stored résumé and fills in any empty Profile / CV fields.
 * Never overwrites data the user already entered.
 */
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { resumeKey: true },
    });
    if (!user?.resumeKey) {
      return NextResponse.json({ error: "No résumé uploaded yet" }, { status: 404 });
    }

    // 1. Download + extract text
    const file = await downloadResume(user.resumeKey);
    if (!file) {
      return NextResponse.json({ error: "Résumé file not found in storage" }, { status: 404 });
    }
    const ext = user.resumeKey.split(".").pop() ?? "pdf";
    const text = await extractResumeText(file.buffer, ext);
    if (text.trim().length < 30) {
      return NextResponse.json(
        { error: "Could not read meaningful text from the résumé (is it a scanned image?)." },
        { status: 422 },
      );
    }

    // 2. Structure via LLM
    const extracted = await structureResume(text);

    // 3. Fill-empty merge with whatever already exists, then persist
    const [currentProfile, currentCv] = await Promise.all([
      safe(() => getProfile(userId)),
      safe(() => getCV(userId)),
    ]);

    const mergedProfile = fillEmpty(currentProfile ?? {}, extracted.profile);
    const mergedCv = fillEmpty(currentCv ?? {}, extracted.cv);

    await Promise.all([
      patchProfile(userId, mergedProfile as Parameters<typeof patchProfile>[1]),
      patchCV(userId, mergedCv as Parameters<typeof patchCV>[1]),
    ]);

    // 4. Return fresh data so the UI can refresh
    const [profile, cv] = await Promise.all([
      safe(() => getProfile(userId)),
      safe(() => getCV(userId)),
    ]);

    return NextResponse.json({ profile, cv, ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

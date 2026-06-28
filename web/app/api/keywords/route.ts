import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/session";
import {
  addKeyword,
  isKeywordKind,
  listKeywords,
  normalizeKeyword,
  removeKeyword,
} from "@/lib/keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYWORD_LENGTH = 80;

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const keywords = await listKeywords(userId);
    return NextResponse.json({ keywords });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { kind?: string; value?: string };

    if (!isKeywordKind(body.kind)) {
      return NextResponse.json(
        { error: 'kind must be "positive" or "negative"' },
        { status: 400 },
      );
    }
    const value = normalizeKeyword(body.value ?? "");
    if (!value) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }
    if (value.length > MAX_KEYWORD_LENGTH) {
      return NextResponse.json(
        { error: `value must be ${MAX_KEYWORD_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    const keywords = await addKeyword(userId, body.kind, value);
    return NextResponse.json({ keywords });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { kind?: string; value?: string };

    if (!isKeywordKind(body.kind)) {
      return NextResponse.json(
        { error: 'kind must be "positive" or "negative"' },
        { status: 400 },
      );
    }
    const value = normalizeKeyword(body.value ?? "");
    if (!value) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    const keywords = await removeKeyword(userId, body.kind, value);
    return NextResponse.json({ keywords });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

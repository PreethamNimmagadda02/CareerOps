import { db } from "../../src/lib/db";

/** A title-filter keyword kind. */
export type KeywordKind = "positive" | "negative";

export interface KeywordSet {
  positive: string[];
  negative: string[];
}

export function isKeywordKind(value: unknown): value is KeywordKind {
  return value === "positive" || value === "negative";
}

/** Normalize a raw keyword: trim and lower-case for stable de-duplication. */
export function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

/** List one user's positive/negative title-filter keywords. */
export async function listKeywords(userId: string): Promise<KeywordSet> {
  const rows = await db.filterKeyword.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { value: "asc" }],
  });
  return {
    positive: rows.filter((k) => k.kind === "positive").map((k) => k.value),
    negative: rows.filter((k) => k.kind === "negative").map((k) => k.value),
  };
}

/**
 * Add a keyword for a user (idempotent). Returns the updated keyword set.
 * The value is normalized; empty values are rejected by the caller.
 */
export async function addKeyword(
  userId: string,
  kind: KeywordKind,
  value: string,
): Promise<KeywordSet> {
  await db.filterKeyword.upsert({
    where: { userId_kind_value: { userId, kind, value } },
    update: {},
    create: { userId, kind, value },
  });
  return listKeywords(userId);
}

/** Remove a keyword for a user. Returns the updated keyword set. */
export async function removeKeyword(
  userId: string,
  kind: KeywordKind,
  value: string,
): Promise<KeywordSet> {
  await db.filterKeyword.deleteMany({ where: { userId, kind, value } });
  return listKeywords(userId);
}

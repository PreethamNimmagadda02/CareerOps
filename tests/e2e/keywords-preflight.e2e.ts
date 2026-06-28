import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "../../src/lib/db.js";
import {
  listKeywords,
  addKeyword,
  removeKeyword,
} from "../../web/lib/keywords.ts";
import { preflightPipeline } from "../../web/lib/preflight.ts";
import { putProfile } from "../../src/lib/profile-store.js";
import { putCV } from "../../src/lib/cv-store.js";
import { makeProfile, makeCV } from "./setup/fixtures.js";
import { deleteProfileItem, deleteCVItem } from "./setup/clients.js";

let userId: string;

beforeAll(async () => {
  const u = await db.user.create({
    data: { email: `e2e-kw-${randomUUID()}@test.local`, name: "e2e-kw" },
  });
  userId = u.id;
});

afterAll(async () => {
  await db.user.delete({ where: { id: userId } }); // cascades FilterKeyword rows
  await deleteProfileItem(userId);
  await deleteCVItem(userId);
  await db.$disconnect();
});

describe("FilterKeyword store (live Postgres)", () => {
  it("starts empty for a new user", async () => {
    expect(await listKeywords(userId)).toEqual({ positive: [], negative: [] });
  });

  it("adds positive and negative keywords and lists them sorted", async () => {
    await addKeyword(userId, "positive", "backend engineer");
    await addKeyword(userId, "positive", "ai");
    const set = await addKeyword(userId, "negative", "senior");

    expect(set.positive).toEqual(["ai", "backend engineer"]); // value asc
    expect(set.negative).toEqual(["senior"]);
  });

  it("is idempotent on the composite (userId, kind, value) key", async () => {
    await addKeyword(userId, "positive", "ai");
    const set = await addKeyword(userId, "positive", "ai");
    expect(set.positive.filter((v) => v === "ai")).toHaveLength(1);
  });

  it("removes a keyword", async () => {
    const set = await removeKeyword(userId, "negative", "senior");
    expect(set.negative).not.toContain("senior");
  });
});

describe("preflight gate (live, cross-store)", () => {
  it("blocks evaluate when DynamoDB has no profile/CV for the user", async () => {
    await deleteProfileItem(userId);
    await deleteCVItem(userId);

    const msg = await preflightPipeline("evaluate", userId);
    expect(msg).toMatch(/Evaluate skipped/);
  });

  it("allows evaluate once a complete profile + CV are seeded", async () => {
    await putProfile(userId, makeProfile());
    await putCV(userId, makeCV());

    expect(await preflightPipeline("evaluate", userId)).toBeNull();
  });

  it("blocks scan when the user has no positive keywords", async () => {
    // Clear any positives left from earlier tests.
    await db.filterKeyword.deleteMany({ where: { userId, kind: "positive" } });

    const msg = await preflightPipeline("scan", userId);
    expect(msg).toMatch(/Scan skipped/);
  });

  it("allows scan once at least one positive keyword exists", async () => {
    await addKeyword(userId, "positive", "platform engineer");
    expect(await preflightPipeline("scan", userId)).toBeNull();
  });
});

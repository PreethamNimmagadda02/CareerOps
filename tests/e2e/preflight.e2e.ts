import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

import { db } from "../../src/lib/db.js";
import { preflightPipeline } from "../../web/lib/preflight.ts";
import { putProfile } from "../../src/lib/profile-store.js";
import { putCV } from "../../src/lib/cv-store.js";
import { makeProfile, makeCV } from "./setup/fixtures.js";
import { deleteProfileItem, deleteCVItem } from "./setup/clients.js";

let userId: string;

beforeAll(async () => {
  const u = await db.user.create({
    data: { email: `e2e-preflight-${randomUUID()}@test.local`, name: "e2e-preflight" },
  });
  userId = u.id;
});

afterAll(async () => {
  await db.user.delete({ where: { id: userId } });
  await deleteProfileItem(userId);
  await deleteCVItem(userId);
  await db.$disconnect();
});

describe("preflight gate (live, DynamoDB profile)", () => {
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

  it("blocks scan when the profile has no job matching preferences", async () => {
    await putProfile(userId, makeProfile());

    const msg = await preflightPipeline("scan", userId);
    expect(msg).toMatch(/Scan skipped/);
  });

  it("allows scan once job matching preferences are seeded", async () => {
    await putProfile(
      userId,
      makeProfile({
        matching: {
          role_domains: ["backend"],
          role_nouns: ["engineer"],
          include_titles: ["platform engineer"],
          exclude_titles: [],
          strong_titles: [],
          seniority_exclusions: [],
          preferred_locations: [],
          remote_ok: true,
          eligible_locations: [],
        },
      }),
    );

    expect(await preflightPipeline("scan", userId)).toBeNull();
  });
});

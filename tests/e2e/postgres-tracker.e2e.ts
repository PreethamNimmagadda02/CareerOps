import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { db } from "../../src/lib/db.js";
import {
  addApplication,
  getApplications,
  patchApplication,
} from "../../src/lib/tracker.js";
import { AppStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

let userId: string;
let otherUserId: string;

beforeAll(async () => {
  const u = await db.user.create({
    data: { email: `e2e-tracker-${randomUUID()}@test.local`, name: "e2e-tracker" },
  });
  userId = u.id;
  const o = await db.user.create({
    data: { email: `e2e-other-${randomUUID()}@test.local`, name: "e2e-other" },
  });
  otherUserId = o.id;
});

afterAll(async () => {
  // Cascade deletes the user's applications too.
  await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await db.$disconnect();
});

describe("Postgres application tracker (live)", () => {
  it("inserts an application and reads it back scoped to the user", async () => {
    const row = await addApplication({
      userId,
      company: "Acme",
      role: "Backend Engineer",
      url: `https://acme.example/jobs/${randomUUID()}`,
    });

    expect(row.company).toBe("Acme");
    expect(row.status).toBe(AppStatus.Evaluated); // default

    const apps = await getApplications(userId);
    expect(apps.map((a) => a.num)).toContain(row.num);
  });

  it("patches status + score for the owning user", async () => {
    const row = await addApplication({
      userId,
      company: "Globex",
      role: "Platform Engineer",
      url: `https://globex.example/jobs/${randomUUID()}`,
    });

    const ok = await patchApplication(row.num, userId, {
      status: AppStatus.Applied,
      score: "4.5/5",
    });
    expect(ok).toBe(true);

    const apps = await getApplications(userId);
    const updated = apps.find((a) => a.num === row.num);
    expect(updated?.status).toBe(AppStatus.Applied);
    expect(updated?.score).toBe("4.5/5");
  });

  it("does not patch an application owned by a different user", async () => {
    const row = await addApplication({
      userId,
      company: "Initech",
      role: "SRE",
      url: `https://initech.example/jobs/${randomUUID()}`,
    });

    const ok = await patchApplication(row.num, otherUserId, { status: AppStatus.Rejected });
    expect(ok).toBe(false);

    // The row is untouched for the real owner.
    const apps = await getApplications(userId);
    expect(apps.find((a) => a.num === row.num)?.status).toBe(AppStatus.Evaluated);
  });

  it("keeps each user's application list isolated", async () => {
    await addApplication({
      userId: otherUserId,
      company: "Umbrella",
      role: "Data Engineer",
      url: `https://umbrella.example/jobs/${randomUUID()}`,
    });

    const mine = await getApplications(userId);
    const theirs = await getApplications(otherUserId);

    expect(mine.every((a) => a.company !== "Umbrella")).toBe(true);
    expect(theirs.some((a) => a.company === "Umbrella")).toBe(true);
  });
});

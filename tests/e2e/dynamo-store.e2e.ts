import { describe, expect, it, afterAll } from "vitest";

import { getCV, putCV, patchCV } from "../../src/lib/cv-store.js";
import { getProfile, putProfile, patchProfile } from "../../src/lib/profile-store.js";
import { e2eUserId, makeCV, makeProfile } from "./setup/fixtures.js";
import { deleteCVItem, deleteProfileItem } from "./setup/clients.js";

const cvUser = e2eUserId("cv");
const profileUser = e2eUserId("profile");

afterAll(async () => {
  await deleteCVItem(cvUser);
  await deleteProfileItem(profileUser);
});

describe("DynamoDB CV store (live)", () => {
  it("returns null for a user with no CV yet", async () => {
    expect(await getCV(e2eUserId("absent"))).toBeNull();
  });

  it("round-trips a full CV and stamps updatedAt", async () => {
    const cv = makeCV();
    await putCV(cvUser, cv);

    const stored = await getCV(cvUser);
    expect(stored).not.toBeNull();
    expect(stored!.summary).toBe(cv.summary);
    expect(stored!.skills).toEqual(cv.skills);
    expect(stored!.experience).toEqual(cv.experience);
    expect(typeof stored!.updatedAt).toBe("string");
    // No key attributes should leak back to callers.
    expect(stored).not.toHaveProperty("PK");
    expect(stored).not.toHaveProperty("SK");
  });

  it("patches a single section without touching the rest", async () => {
    await putCV(cvUser, makeCV());
    await patchCV(cvUser, { summary: "Patched summary." });

    const stored = await getCV(cvUser);
    expect(stored!.summary).toBe("Patched summary.");
    // Other sections survive the partial update.
    expect(stored!.skills).toEqual(makeCV().skills);
  });
});

describe("DynamoDB Profile store (live)", () => {
  it("returns null for a user with no profile yet", async () => {
    expect(await getProfile(e2eUserId("absent"))).toBeNull();
  });

  it("round-trips a full profile", async () => {
    const profile = makeProfile();
    await putProfile(profileUser, profile);

    const stored = await getProfile(profileUser);
    expect(stored!.candidate.full_name).toBe("Ada Lovelace");
    expect(stored!.target_roles.primary).toEqual(["Backend Engineer"]);
    expect(typeof stored!.updatedAt).toBe("string");
  });

  it("patches a single top-level field", async () => {
    await putProfile(profileUser, makeProfile());
    await patchProfile(profileUser, {
      compensation: {
        target_range: "£120k",
        currency: "GBP",
        minimum: "£100k",
        location_flexibility: "remote",
      },
    });

    const stored = await getProfile(profileUser);
    expect(stored!.compensation.target_range).toBe("£120k");
    expect(stored!.candidate.full_name).toBe("Ada Lovelace");
  });

  it("isolates data between two users", async () => {
    const a = e2eUserId("iso-a");
    const b = e2eUserId("iso-b");
    try {
      await putProfile(
        a,
        makeProfile({ candidate: { ...makeProfile().candidate, full_name: "User A" } }),
      );
      await putProfile(
        b,
        makeProfile({ candidate: { ...makeProfile().candidate, full_name: "User B" } }),
      );

      expect((await getProfile(a))!.candidate.full_name).toBe("User A");
      expect((await getProfile(b))!.candidate.full_name).toBe("User B");
    } finally {
      await deleteProfileItem(a);
      await deleteProfileItem(b);
    }
  });
});

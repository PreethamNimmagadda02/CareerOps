import { describe, expect, it, vi, beforeEach } from "vitest";

import { getCV, putCV, patchCV, type CV } from "../src/lib/cv-store.js";
import { getProfile, putProfile, patchProfile, type Profile } from "../src/lib/profile-store.js";

// Single mocked DynamoDB document client shared by both stores.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("../src/lib/dynamo.js", () => ({
  ddb: { send: sendMock },
  TABLE_CV: "CVs",
  TABLE_PROFILE: "Profiles",
}));

const sampleCV: CV = {
  summary: "Engineer",
  skills: [{ category: "Lang", items: ["TS"] }],
  experience: [],
};

const sampleProfile: Profile = {
  candidate: {
    full_name: "Ada",
    email: "a@b.c",
    phone: "1",
    location: "X",
    linkedin: "in",
    portfolio_url: "p",
    github: "g",
  },
  target_roles: { primary: ["BE"], archetypes: [] },
  narrative: { headline: "h", exit_story: "", superpowers: [], proof_points: [] },
  compensation: { target_range: "", currency: "", minimum: "", location_flexibility: "" },
  location: { country: "", city: "", timezone: "", visa_status: "" },
};

beforeEach(() => vi.clearAllMocks());

describe("cv-store", () => {
  it("getCV returns null when no item exists", async () => {
    sendMock.mockResolvedValueOnce({});
    expect(await getCV("user-1")).toBeNull();
  });

  it("getCV reads the user-scoped PK/SK and strips key attributes", async () => {
    sendMock.mockResolvedValueOnce({ Item: { PK: "CV#user-1", SK: "v1", ...sampleCV } });

    const cv = await getCV("user-1");

    expect(cv).toEqual(sampleCV);
    expect(cv).not.toHaveProperty("PK");
    expect(cv).not.toHaveProperty("SK");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input).toMatchObject({
      TableName: "CVs",
      Key: { PK: "CV#user-1", SK: "v1" },
    });
  });

  it("getCV throws an actionable error when the table is missing", async () => {
    sendMock.mockRejectedValueOnce({ name: "ResourceNotFoundException" });
    await expect(getCV("user-1")).rejects.toThrow(/dynamo:init/);
  });

  it("getCV rethrows unexpected errors untouched", async () => {
    sendMock.mockRejectedValueOnce(new Error("network boom"));
    await expect(getCV("user-1")).rejects.toThrow("network boom");
  });

  it("putCV writes the full record under the user PK and stamps updatedAt", async () => {
    sendMock.mockResolvedValueOnce({});
    await putCV("user-7", sampleCV);

    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.TableName).toBe("CVs");
    expect(cmd.input.Item.PK).toBe("CV#user-7");
    expect(cmd.input.Item.SK).toBe("v1");
    expect(cmd.input.Item.summary).toBe("Engineer");
    expect(typeof cmd.input.Item.updatedAt).toBe("string");
  });

  it("patchCV builds a SET expression for only the provided fields", async () => {
    sendMock.mockResolvedValueOnce({});
    await patchCV("user-1", { summary: "New summary" });

    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ PK: "CV#user-1", SK: "v1" });
    expect(cmd.input.UpdateExpression).toContain("#f0 = :v0");
    expect(cmd.input.UpdateExpression).toContain("updatedAt = :ts");
    expect(cmd.input.ExpressionAttributeNames).toEqual({ "#f0": "summary" });
    expect(cmd.input.ExpressionAttributeValues[":v0"]).toBe("New summary");
    expect(typeof cmd.input.ExpressionAttributeValues[":ts"]).toBe("string");
  });

  it("patchCV is a no-op when no fields are supplied", async () => {
    await patchCV("user-1", {});
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("profile-store", () => {
  it("getProfile returns null when no item exists", async () => {
    sendMock.mockResolvedValueOnce({});
    expect(await getProfile("user-1")).toBeNull();
  });

  it("getProfile reads the PROFILE# PK and strips key attributes", async () => {
    sendMock.mockResolvedValueOnce({
      Item: { PK: "PROFILE#user-1", SK: "v1", ...sampleProfile },
    });

    const profile = await getProfile("user-1");

    expect(profile).toEqual(sampleProfile);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.TableName).toBe("Profiles");
    expect(cmd.input.Key).toEqual({ PK: "PROFILE#user-1", SK: "v1" });
  });

  it("getProfile throws an actionable error when the table is missing", async () => {
    sendMock.mockRejectedValueOnce({ name: "ResourceNotFoundException" });
    await expect(getProfile("user-1")).rejects.toThrow(/dynamo:init/);
  });

  it("putProfile writes under the user PROFILE# PK", async () => {
    sendMock.mockResolvedValueOnce({});
    await putProfile("user-9", sampleProfile);

    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Item.PK).toBe("PROFILE#user-9");
    expect(cmd.input.Item.SK).toBe("v1");
    expect(cmd.input.Item.candidate.full_name).toBe("Ada");
  });

  it("patchProfile updates only the provided top-level fields", async () => {
    sendMock.mockResolvedValueOnce({});
    await patchProfile("user-1", { compensation: sampleProfile.compensation });

    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeNames).toEqual({ "#f0": "compensation" });
    expect(cmd.input.ExpressionAttributeValues[":v0"]).toEqual(sampleProfile.compensation);
  });

  it("patchProfile is a no-op when no fields are supplied", async () => {
    await patchProfile("user-1", {});
    expect(sendMock).not.toHaveBeenCalled();
  });
});

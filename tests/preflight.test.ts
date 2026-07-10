import { describe, expect, it, vi, beforeEach } from "vitest";

import { preflightPipeline } from "../web/lib/preflight.ts";
import { db } from "../src/lib/db";
import { getProfile } from "../src/lib/profile-store";
import { getCV } from "../src/lib/cv-store";
import type { Profile } from "../src/lib/profile-store";
import type { CV } from "../src/lib/cv-store";

vi.mock("../src/lib/db", () => ({
  db: { filterKeyword: { count: vi.fn() } },
}));
vi.mock("../src/lib/profile-store", () => ({ getProfile: vi.fn() }));
vi.mock("../src/lib/cv-store", () => ({ getCV: vi.fn() }));

const countMock = db.filterKeyword.count as unknown as ReturnType<typeof vi.fn>;
const getProfileMock = getProfile as unknown as ReturnType<typeof vi.fn>;
const getCVMock = getCV as unknown as ReturnType<typeof vi.fn>;

const fullProfile: Profile = {
  candidate: {
    full_name: "Ada",
    email: "a@b.c",
    phone: "1",
    location: "X",
    linkedin: "in",
    portfolio_url: "p",
    github: "g",
  },
  target_roles: { primary: ["Backend Engineer"], archetypes: [] },
  narrative: { headline: "Builder", exit_story: "", superpowers: [], proof_points: [] },
  compensation: { target_range: "", currency: "", minimum: "", location_flexibility: "" },
  location: { country: "", city: "", timezone: "", visa_status: "" },
  matching: {
    role_domains: ["backend"],
    role_nouns: ["engineer"],
    include_titles: [],
    exclude_titles: [],
    strong_titles: [],
    seniority_exclusions: [],
    preferred_locations: ["berlin"],
    remote_ok: true,
    eligible_locations: [],
  },
};

const fullCV: CV = {
  summary: "Engineer",
  skills: [{ category: "Lang", items: ["TS"] }],
  experience: [],
};

beforeEach(() => vi.clearAllMocks());

describe("preflightPipeline — scan", () => {
  it("blocks scan when the user has no positive keywords", async () => {
    countMock.mockResolvedValueOnce(0);
    const msg = await preflightPipeline("scan", "user-1");
    expect(msg).toMatch(/Scan skipped/);
    expect(countMock).toHaveBeenCalledWith({
      where: { userId: "user-1", kind: "positive" },
    });
  });

  it("allows scan when keywords and job matching preferences exist", async () => {
    countMock.mockResolvedValueOnce(3);
    getProfileMock.mockResolvedValueOnce(fullProfile);
    expect(await preflightPipeline("scan", "user-1")).toBeNull();
  });

  it("blocks scan when the profile has no job matching preferences", async () => {
    countMock.mockResolvedValueOnce(3);
    getProfileMock.mockResolvedValueOnce({ ...fullProfile, matching: undefined });
    const msg = await preflightPipeline("scan", "user-1");
    expect(msg).toMatch(/Scan skipped/);
    expect(msg).toContain("Job matching preferences");
  });

  it("blocks scan when the user allows no locations at all", async () => {
    countMock.mockResolvedValueOnce(3);
    getProfileMock.mockResolvedValueOnce({
      ...fullProfile,
      matching: { ...fullProfile.matching, preferred_locations: [], remote_ok: false },
    });
    const msg = await preflightPipeline("scan", "user-1");
    expect(msg).toMatch(/Scan skipped/);
    expect(msg).toContain("preferred location");
  });

  it("applies the same gate to scan:fallback", async () => {
    countMock.mockResolvedValueOnce(0);
    const msg = await preflightPipeline("scan:fallback", "user-1");
    expect(msg).toMatch(/Scan skipped/);
  });
});

describe("preflightPipeline — evaluate", () => {
  it("allows evaluate when the profile and CV are complete", async () => {
    getProfileMock.mockResolvedValueOnce(fullProfile);
    getCVMock.mockResolvedValueOnce(fullCV);
    expect(await preflightPipeline("evaluate", "user-1")).toBeNull();
  });

  it("blocks evaluate and lists missing fields when the profile is incomplete", async () => {
    getProfileMock.mockResolvedValueOnce({
      ...fullProfile,
      narrative: { ...fullProfile.narrative, headline: "" },
    });
    getCVMock.mockResolvedValueOnce(fullCV);

    const msg = await preflightPipeline("evaluate", "user-1");
    expect(msg).toMatch(/Evaluate skipped/);
    expect(msg).toContain("Professional headline (Career Profile)");
  });

  it("treats a thrown store error as missing data (safe wrapper)", async () => {
    getProfileMock.mockRejectedValueOnce(new Error("dynamo down"));
    getCVMock.mockResolvedValueOnce(fullCV);

    const msg = await preflightPipeline("evaluate", "user-1");
    expect(msg).toMatch(/Evaluate skipped/);
    expect(msg).toContain("Your profile has not been set up yet");
  });

  it("applies to evaluate:dry as well", async () => {
    getProfileMock.mockResolvedValueOnce(null);
    getCVMock.mockResolvedValueOnce(null);
    const msg = await preflightPipeline("evaluate:dry", "user-1");
    expect(msg).toMatch(/Evaluate skipped/);
  });
});

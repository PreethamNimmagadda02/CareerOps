import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  cvToMarkdown,
  profileToYaml,
  loadCandidateContext,
} from "../src/lib/candidate-loader.js";
import { getCV, type CV } from "../src/lib/cv-store.js";
import { getProfile, type Profile } from "../src/lib/profile-store.js";

vi.mock("../src/lib/cv-store.js", () => ({ getCV: vi.fn() }));
vi.mock("../src/lib/profile-store.js", () => ({ getProfile: vi.fn() }));
vi.mock("../src/lib/logger.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const getCVMock = getCV as unknown as ReturnType<typeof vi.fn>;
const getProfileMock = getProfile as unknown as ReturnType<typeof vi.fn>;

const cv: CV = {
  summary: "Seasoned engineer.",
  skills: [{ category: "Languages", items: ["TypeScript", "Go"] }],
  experience: [
    {
      company: "Acme",
      role: "Senior Engineer",
      location: "Remote",
      period: "2020-2024",
      highlights: ["Shipped X", "Scaled Y"],
    },
  ],
  education: [
    { institution: "MIT", degree: "BSc", field: "CS", location: "US", period: "2012-2016" },
  ],
  certifications: [{ name: "AWS SA", issuer: "Amazon", date: "2021" }],
  languages: [{ name: "English", proficiency: "Native" }],
};

const profile: Profile = {
  candidate: {
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1 555 0100",
    location: "London",
    linkedin: "in/ada",
    portfolio_url: "ada.dev",
    github: "ada",
    twitter: "@ada",
  },
  target_roles: {
    primary: ["Backend Engineer"],
    archetypes: [{ name: "Platform", level: "Senior", fit: "primary" }],
  },
  narrative: {
    headline: "Backend engineer who ships",
    exit_story: "Looking for impact",
    superpowers: ["systems"],
    proof_points: [{ name: "Project X", url: "x.dev", hero_metric: "10x" }],
  },
  compensation: { target_range: "£100k", currency: "GBP", minimum: "£90k", location_flexibility: "remote" },
  location: { country: "UK", city: "London", timezone: "GMT", visa_status: "citizen", onsite_availability: "hybrid" },
};

beforeEach(() => vi.clearAllMocks());

describe("cvToMarkdown", () => {
  it("renders all sections with the candidate name heading", () => {
    const md = cvToMarkdown(cv, "Ada Lovelace");
    expect(md).toContain("# Ada Lovelace");
    expect(md).toContain("## Professional Summary");
    expect(md).toContain("Seasoned engineer.");
    expect(md).toContain("* **Languages:** TypeScript, Go");
    expect(md).toContain("### Acme");
    expect(md).toContain("**Senior Engineer** | Remote");
    expect(md).toContain("* Shipped X");
    expect(md).toContain("### MIT");
    expect(md).toContain("**BSc (CS)** | US");
    expect(md).toContain("* AWS SA — Amazon · 2021");
    expect(md).toContain("* **English:** Native");
  });

  it("omits empty sections and the name heading when not provided", () => {
    const md = cvToMarkdown({
      summary: "",
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      languages: [],
    });
    expect(md).not.toContain("#");
    expect(md).not.toContain("Professional Summary");
  });
});

describe("profileToYaml", () => {
  it("serializes the profile and includes optional twitter when present", () => {
    const yaml = profileToYaml(profile);
    expect(yaml).toContain('full_name: "Ada Lovelace"');
    expect(yaml).toContain('twitter: "@ada"');
    expect(yaml).toContain("target_roles:");
    expect(yaml).toContain('    - "Backend Engineer"');
    expect(yaml).toContain('      fit: "primary"');
    expect(yaml).toContain('headline: "Backend engineer who ships"');
    expect(yaml).toContain('onsite_availability: "hybrid"');
  });

  it("omits optional twitter/onsite_availability when absent", () => {
    const slim: Profile = {
      ...profile,
      candidate: { ...profile.candidate, twitter: undefined },
      location: { ...profile.location, onsite_availability: undefined },
    };
    const yaml = profileToYaml(slim);
    expect(yaml).not.toContain("twitter:");
    expect(yaml).not.toContain("onsite_availability:");
  });
});

describe("loadCandidateContext", () => {
  it("returns serialized CV markdown and profile YAML when both records exist", async () => {
    getCVMock.mockResolvedValueOnce(cv);
    getProfileMock.mockResolvedValueOnce(profile);

    const ctx = await loadCandidateContext("user-1");

    expect(ctx.cv).toContain("# Ada Lovelace");
    expect(ctx.cv).toContain("## Professional Summary");
    expect(ctx.profileYml).toContain('full_name: "Ada Lovelace"');
    expect(getCVMock).toHaveBeenCalledWith("user-1");
    expect(getProfileMock).toHaveBeenCalledWith("user-1");
  });

  it("throws naming the CV when it is missing", async () => {
    getCVMock.mockResolvedValueOnce(null);
    getProfileMock.mockResolvedValueOnce(profile);
    await expect(loadCandidateContext("user-1")).rejects.toThrow(/missing: CV/);
  });

  it("throws naming the Profile when it is missing", async () => {
    getCVMock.mockResolvedValueOnce(cv);
    getProfileMock.mockResolvedValueOnce(null);
    await expect(loadCandidateContext("user-1")).rejects.toThrow(/missing: Profile/);
  });

  it("throws naming both when neither record exists", async () => {
    getCVMock.mockResolvedValueOnce(null);
    getProfileMock.mockResolvedValueOnce(null);
    await expect(loadCandidateContext("user-1")).rejects.toThrow(/missing: CV and Profile/);
  });
});

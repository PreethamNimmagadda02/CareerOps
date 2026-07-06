import { describe, expect, it } from "vitest";

import {
  validateCandidateReadiness,
  validateMatchingReadiness,
} from "../src/lib/profile-validation.js";
import type { Profile, MatchingPrefs } from "../src/lib/profile-store.js";
import type { CV } from "../src/lib/cv-store.js";

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    candidate: {
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1 555 0100",
      location: "London",
      linkedin: "in/ada",
      portfolio_url: "ada.dev",
      github: "ada",
    },
    target_roles: { primary: ["Backend Engineer"], archetypes: [] },
    narrative: {
      headline: "Backend engineer who ships",
      exit_story: "",
      superpowers: [],
      proof_points: [],
    },
    compensation: { target_range: "", currency: "", minimum: "", location_flexibility: "" },
    location: { country: "", city: "", timezone: "", visa_status: "" },
    ...over,
  };
}

function makeCV(over: Partial<CV> = {}): CV {
  return {
    summary: "Seasoned engineer.",
    skills: [{ category: "Languages", items: ["TypeScript"] }],
    experience: [
      {
        company: "Acme",
        role: "Engineer",
        location: "Remote",
        period: "2020-2024",
        highlights: ["Shipped"],
      },
    ],
    education: [],
    certifications: [],
    languages: [],
    ...over,
  };
}

describe("validateCandidateReadiness", () => {
  it("passes when profile and CV have all required data", () => {
    const r = validateCandidateReadiness(makeProfile(), makeCV());
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("reports both records when profile and CV are null", () => {
    const r = validateCandidateReadiness(null, null);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("Your profile has not been set up yet");
    expect(r.missing).toContain("Your CV details have not been set up yet");
  });

  it("flags a missing full name", () => {
    const profile = makeProfile();
    profile.candidate.full_name = "";
    const r = validateCandidateReadiness(profile, makeCV());
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("Full name (Personal Info)");
  });

  it("treats whitespace-only strings as empty", () => {
    const profile = makeProfile();
    profile.candidate.full_name = "   ";
    profile.narrative.headline = "\t\n";
    const r = validateCandidateReadiness(profile, makeCV());
    expect(r.missing).toContain("Full name (Personal Info)");
    expect(r.missing).toContain("Professional headline (Career Profile)");
  });

  it("flags an empty target_roles.primary list", () => {
    const profile = makeProfile({ target_roles: { primary: [], archetypes: [] } });
    const r = validateCandidateReadiness(profile, makeCV());
    expect(r.missing).toContain("At least one target role (Career Profile)");
  });

  it("accepts a CV with a summary but no experience", () => {
    const cv = makeCV({ experience: [] });
    const r = validateCandidateReadiness(makeProfile(), cv);
    expect(r.ok).toBe(true);
  });

  it("accepts a CV with experience but no summary", () => {
    const cv = makeCV({ summary: "" });
    const r = validateCandidateReadiness(makeProfile(), cv);
    expect(r.ok).toBe(true);
  });

  it("flags a CV with neither summary nor experience", () => {
    const cv = makeCV({ summary: "   ", experience: [] });
    const r = validateCandidateReadiness(makeProfile(), cv);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("A professional summary or at least one work experience");
  });

  it("flags a CV with no skills", () => {
    const cv = makeCV({ skills: [] });
    const r = validateCandidateReadiness(makeProfile(), cv);
    expect(r.missing).toContain("At least one skill");
  });

  it("accumulates every missing field across profile and CV", () => {
    const profile = makeProfile({
      candidate: {
        full_name: "",
        email: "",
        phone: "",
        location: "",
        linkedin: "",
        portfolio_url: "",
        github: "",
      },
      target_roles: { primary: [], archetypes: [] },
      narrative: { headline: "", exit_story: "", superpowers: [], proof_points: [] },
    });
    const cv = makeCV({ summary: "", experience: [], skills: [] });
    const r = validateCandidateReadiness(profile, cv);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([
      "Full name (Personal Info)",
      "Professional headline (Career Profile)",
      "At least one target role (Career Profile)",
      "A professional summary or at least one work experience",
      "At least one skill",
    ]);
  });
});

const MATCHING_OK: MatchingPrefs = {
  role_domains: ["backend"],
  role_nouns: ["engineer"],
  include_titles: [],
  exclude_titles: [],
  strong_titles: [],
  seniority_exclusions: [],
  preferred_locations: ["berlin"],
  remote_ok: true,
  excluded_locations: [],
};

describe("validateMatchingReadiness", () => {
  it("passes when matching prefs have role + location config", () => {
    const r = validateMatchingReadiness(makeProfile({ matching: MATCHING_OK }));
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("reports when the profile is null", () => {
    const r = validateMatchingReadiness(null);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("Your profile has not been set up yet");
  });

  it("reports when matching is missing", () => {
    const r = validateMatchingReadiness(makeProfile({ matching: undefined }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain(
      "Job matching preferences (Job Matching section of your profile)",
    );
  });

  it("reports when no role indicator is configured", () => {
    const r = validateMatchingReadiness(
      makeProfile({
        matching: {
          ...MATCHING_OK,
          role_domains: [],
          role_nouns: [],
          include_titles: [],
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain(
      "At least one role indicator (Job Matching section — discipline keywords, role nouns, or include titles)",
    );
  });

  it("accepts include_titles alone as a role indicator", () => {
    const r = validateMatchingReadiness(
      makeProfile({
        matching: { ...MATCHING_OK, role_domains: [], role_nouns: [], include_titles: ["ai engineer"] },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("reports when neither preferred locations nor remote are allowed", () => {
    const r = validateMatchingReadiness(
      makeProfile({ matching: { ...MATCHING_OK, preferred_locations: [], remote_ok: false } }),
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain(
      "At least one preferred location — or allow remote roles (Job Matching section)",
    );
  });

  it("accepts remote_ok without preferred locations", () => {
    const r = validateMatchingReadiness(
      makeProfile({ matching: { ...MATCHING_OK, preferred_locations: [] } }),
    );
    expect(r.ok).toBe(true);
  });

  it("accumulates both role and location errors when both are missing", () => {
    const r = validateMatchingReadiness(
      makeProfile({
        matching: {
          role_domains: [],
          role_nouns: [],
          include_titles: [],
          exclude_titles: [],
          strong_titles: [],
          seniority_exclusions: [],
          preferred_locations: [],
          remote_ok: false,
          excluded_locations: [],
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBe(2);
  });
});

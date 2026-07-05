import { describe, expect, it } from "vitest";

import { validateCandidateReadiness } from "../src/lib/profile-validation.js";
import type { Profile } from "../src/lib/profile-store.js";
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

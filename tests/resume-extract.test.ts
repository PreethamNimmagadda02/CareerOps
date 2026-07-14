import { describe, expect, it } from "vitest";

import {
  deriveMatchingDefaults,
  fillEmpty,
  normalizeCv,
  normalizeExtraction,
  normalizeProfile,
} from "../web/lib/resume-extract.ts";
import type { ExtractedProfile } from "../web/lib/resume-extract.ts";

describe("fillEmpty — scalars", () => {
  it("keeps a non-empty target value over the source", () => {
    expect(fillEmpty("typed", "extracted")).toBe("typed");
  });

  it("fills an empty-string target from the source", () => {
    expect(fillEmpty("", "extracted")).toBe("extracted");
  });

  it("treats whitespace-only target as empty", () => {
    expect(fillEmpty("   ", "extracted")).toBe("extracted");
  });

  it("returns the target when source is null", () => {
    expect(fillEmpty("typed", null as unknown as string)).toBe("typed");
  });

  it("returns the source when target is null", () => {
    expect(fillEmpty(null as unknown as string, "extracted")).toBe("extracted");
  });
});

describe("fillEmpty — arrays", () => {
  it("keeps a non-empty target array verbatim (no element merge)", () => {
    expect(fillEmpty(["a"], ["b", "c"])).toEqual(["a"]);
  });

  it("uses the source array when the target array is empty", () => {
    expect(fillEmpty([], ["b", "c"])).toEqual(["b", "c"]);
  });
});

describe("fillEmpty — objects", () => {
  it("fills only the missing/empty leaf fields and preserves user data", () => {
    const target = { name: "Ada", email: "", phone: "" };
    const source = { name: "Someone Else", email: "ada@x.com", phone: "123" };
    expect(fillEmpty(target, source)).toEqual({
      name: "Ada",
      email: "ada@x.com",
      phone: "123",
    });
  });

  it("adds keys that exist only in the source", () => {
    const target = { name: "Ada" } as Record<string, unknown>;
    const source = { name: "X", github: "ada" };
    expect(fillEmpty(target, source)).toEqual({ name: "Ada", github: "ada" });
  });

  it("merges nested objects recursively", () => {
    const target = {
      candidate: { full_name: "Ada", email: "" },
      narrative: { headline: "", superpowers: [] as string[] },
    };
    const source = {
      candidate: { full_name: "Wrong", email: "ada@x.com" },
      narrative: { headline: "Engineer", superpowers: ["fast"] },
    };
    expect(fillEmpty(target, source)).toEqual({
      candidate: { full_name: "Ada", email: "ada@x.com" },
      narrative: { headline: "Engineer", superpowers: ["fast"] },
    });
  });

  it("fills a whole empty nested object from the source", () => {
    const target = { location: { country: "", city: "" } };
    const source = { location: { country: "UK", city: "London" } };
    expect(fillEmpty(target, source)).toEqual({
      location: { country: "UK", city: "London" },
    });
  });

  it("does not mutate the original target object", () => {
    const target = { name: "Ada", email: "" };
    const snapshot = { ...target };
    fillEmpty(target, { name: "X", email: "a@b.c" });
    expect(target).toEqual(snapshot);
  });
});

// ── deriveMatchingDefaults ───────────────────────────────────────────────────

type MatchingInput = Pick<ExtractedProfile, "target_roles" | "candidate" | "location">;

function makeInput(over: Partial<MatchingInput> = {}): MatchingInput {
  return {
    target_roles: { primary: [], archetypes: [] },
    candidate: {
      full_name: "", email: "", phone: "", location: "",
      linkedin: "", portfolio_url: "", github: "", twitter: "",
    },
    location: { country: "", city: "", timezone: "", visa_status: "", onsite_availability: "" },
    ...over,
  };
}

describe("deriveMatchingDefaults", () => {
  it("splits a simple title into a single-word domain + noun", () => {
    const m = deriveMatchingDefaults(makeInput({ target_roles: { primary: ["Backend Engineer"], archetypes: [] } }));
    expect(m.role_domains).toEqual(["backend"]);
    expect(m.role_nouns).toEqual(["engineer"]);
    expect(m.include_titles).toEqual(["backend engineer"]);
  });

  it("keeps a multi-word domain phrase intact", () => {
    const m = deriveMatchingDefaults(
      makeInput({ target_roles: { primary: ["Machine Learning Engineer"], archetypes: [] } }),
    );
    expect(m.role_domains).toEqual(["machine learning"]);
    expect(m.role_nouns).toEqual(["engineer"]);
  });

  it("pulls titles from both target_roles.primary and archetype names, deduped", () => {
    const m = deriveMatchingDefaults(
      makeInput({
        target_roles: {
          primary: ["Backend Engineer", "Platform Engineer"],
          archetypes: [{ name: "Backend Engineer", level: "Mid", fit: "primary" }],
        },
      }),
    );
    expect(m.include_titles).toEqual(["backend engineer", "platform engineer"]);
    expect(m.role_domains.sort()).toEqual(["backend", "platform"]);
    expect(m.role_nouns).toEqual(["engineer"]);
  });

  it("falls back to include_titles only when the title has no recognized trailing noun", () => {
    const m = deriveMatchingDefaults(makeInput({ target_roles: { primary: ["Founder"], archetypes: [] } }));
    expect(m.role_domains).toEqual([]);
    expect(m.role_nouns).toEqual([]);
    expect(m.include_titles).toEqual(["founder"]);
  });

  it("derives preferred locations from candidate.location, city, and country", () => {
    const m = deriveMatchingDefaults(
      makeInput({
        candidate: {
          full_name: "", email: "", phone: "", location: "Bengaluru, Karnataka, India",
          linkedin: "", portfolio_url: "", github: "", twitter: "",
        },
        location: { country: "India", city: "Bengaluru", timezone: "", visa_status: "", onsite_availability: "" },
      }),
    );
    expect(m.preferred_locations).toEqual(["bengaluru", "karnataka", "india"]);
  });

  it("always defaults remote_ok to true", () => {
    expect(deriveMatchingDefaults(makeInput()).remote_ok).toBe(true);
  });

  it("never invents exclusions or a seniority ceiling", () => {
    const m = deriveMatchingDefaults(
      makeInput({ target_roles: { primary: ["Senior Backend Engineer"], archetypes: [] } }),
    );
    expect(m.exclude_titles).toEqual([]);
    expect(m.strong_titles).toEqual([]);
    expect(m.seniority_exclusions).toEqual([]);
    expect(m.eligible_locations).toEqual([]);
  });

  it("returns a fully-formed object with empty lists when there is no signal at all", () => {
    const m = deriveMatchingDefaults(makeInput());
    expect(m).toEqual({
      role_domains: [],
      role_nouns: [],
      include_titles: [],
      exclude_titles: [],
      strong_titles: [],
      seniority_exclusions: [],
      preferred_locations: [],
      remote_ok: true,
      eligible_locations: [],
    });
  });
});

// ── normalizeProfile ─────────────────────────────────────────────────────────

describe("normalizeProfile — consistency & coercion", () => {
  it("returns a fully-formed object from empty/garbage input", () => {
    const p = normalizeProfile(null);
    expect(p.candidate.full_name).toBe("");
    expect(p.target_roles.primary).toEqual([]);
    expect(p.target_roles.archetypes).toEqual([]);
    expect(p.narrative.superpowers).toEqual([]);
    expect(p.compensation.currency).toBe("");
    expect(p.location.city).toBe("");
  });

  it("trims and collapses whitespace on scalar fields", () => {
    const p = normalizeProfile({ candidate: { full_name: "  Ada   Lovelace \n" } });
    expect(p.candidate.full_name).toBe("Ada Lovelace");
  });

  it("keeps only valid emails and lowercases them", () => {
    expect(normalizeProfile({ candidate: { email: "ADA@X.COM" } }).candidate.email).toBe("ada@x.com");
    expect(normalizeProfile({ candidate: { email: "not-an-email" } }).candidate.email).toBe("");
  });

  it("adds https:// to bare domains but leaves handles and full URLs alone", () => {
    const c = normalizeProfile({
      candidate: {
        linkedin: "linkedin.com/in/ada",
        github: "@ada",
        portfolio_url: "https://ada.dev",
      },
    }).candidate;
    expect(c.linkedin).toBe("https://linkedin.com/in/ada");
    expect(c.github).toBe("ada");
    expect(c.portfolio_url).toBe("https://ada.dev");
  });

  it("coerces target_roles.primary from a delimited string and dedupes", () => {
    const p = normalizeProfile({
      target_roles: { primary: "Backend Engineer, Backend Engineer; Platform Engineer" },
    });
    expect(p.target_roles.primary).toEqual(["Backend Engineer", "Platform Engineer"]);
  });

  it("clamps an invalid archetype fit to 'primary' and drops nameless entries", () => {
    const p = normalizeProfile({
      target_roles: {
        archetypes: [
          { name: "Backend Engineer", level: "Mid", fit: "best" },
          { name: "", level: "Senior", fit: "secondary" },
        ],
      },
    });
    expect(p.target_roles.archetypes).toEqual([
      { name: "Backend Engineer", level: "Mid", fit: "primary" },
    ]);
  });

  it("never lets the model's matching guess through — matching is always derived", () => {
    const p = normalizeExtraction({
      profile: {
        target_roles: { primary: ["Backend Engineer"] },
        matching: { include_titles: ["hacked"], remote_ok: false },
      },
    }).profile;
    expect(p.matching?.include_titles).toEqual(["backend engineer"]);
    expect(p.matching?.remote_ok).toBe(true);
  });
});

// ── normalizeCv ──────────────────────────────────────────────────────────────

describe("normalizeCv — consistency & coercion", () => {
  it("returns all sections as arrays even from empty input", () => {
    const cv = normalizeCv(undefined);
    expect(cv).toEqual({
      summary: "",
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      languages: [],
    });
  });

  it("folds a flat string skills list into a single group and dedupes", () => {
    const cv = normalizeCv({ skills: ["Go", "Go", "TypeScript"] });
    expect(cv.skills).toEqual([{ category: "Skills", items: ["Go", "TypeScript"] }]);
  });

  it("keeps grouped skills and cleans their items", () => {
    const cv = normalizeCv({
      skills: [{ category: " Languages ", items: ["Go ", " Go", "Rust"] }],
    });
    expect(cv.skills).toEqual([{ category: "Languages", items: ["Go", "Rust"] }]);
  });

  it("coerces highlights from a bulleted string and drops empty experience rows", () => {
    const cv = normalizeCv({
      experience: [
        { company: "Acme", role: "Engineer", highlights: "Shipped X\u2022Led Y" },
        { company: "", role: "" },
      ],
    });
    expect(cv.experience).toHaveLength(1);
    expect(cv.experience[0].highlights).toEqual(["Shipped X", "Led Y"]);
  });

  it("extracts education, certifications, projects and languages, dropping empty entries", () => {
    const cv = normalizeCv({
      education: [
        { school: "MIT", degree: "BSc", field_of_study: "CS", year: "2018" },
        { institution: "" },
      ],
      certifications: [{ name: "AWS SA", authority: "Amazon", date: "2022" }, { name: "" }],
      projects: [{ title: "Widget", link: "widget.io", bullets: ["Fast"] }],
      languages: ["English", { name: "French", level: "Fluent" }],
    });
    expect(cv.education).toEqual([
      { institution: "MIT", degree: "BSc", field: "CS", period: "2018", details: "" },
    ]);
    expect(cv.certifications).toEqual([{ name: "AWS SA", issuer: "Amazon", year: "2022" }]);
    expect(cv.projects).toEqual([
      { name: "Widget", description: "", url: "https://widget.io", highlights: ["Fast"] },
    ]);
    expect(cv.languages).toEqual([
      { language: "English", proficiency: "" },
      { language: "French", proficiency: "Fluent" },
    ]);
  });
});

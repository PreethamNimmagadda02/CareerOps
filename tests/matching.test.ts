import { describe, expect, it } from "vitest";

import {
  engineeringMatch,
  isHighSignal,
  locationMatch,
  normalizeMatchingPrefs,
  titleMatches,
} from "../src/lib/matching.js";
import type { MatchingPrefs } from "../src/lib/profile-store.js";

const POSITIVE = ["ai", "ml", "backend engineer", "software engineer", "platform engineer"];
const NEGATIVE = [".net", "senior", "staff", "principal", "lead"];

/**
 * A prefs fixture equivalent to what a candidate would enter in the
 * "Job Matching" section of their profile (here: an entry-level engineer
 * based in India, open to remote).
 */
const PREFS: MatchingPrefs = normalizeMatchingPrefs({
  role_domains: ["software", "backend", "ai", "ml", "machine learning", "forward deployed"],
  role_nouns: ["engineer", "engineering", "developer", "architect"],
  include_titles: ["ai engineer", "software engineer", "forward deployed engineer"],
  exclude_titles: ["sales", "data scientist", "support engineer", "marketing", "recruiter"],
  strong_titles: ["ai engineer", "software engineer", "machine learning", "backend engineer"],
  seniority_exclusions: ["senior", "staff", "principal", "lead", "manager", "director", "head"],
  preferred_locations: ["india", "bengaluru", "bangalore", "hyderabad", "mumbai"],
  remote_ok: true,
  excluded_locations: ["us", "usa", "united states", "uk", "london", "san francisco", "ca"],
});

describe("titleMatches", () => {
  it("flags relevant titles", () => {
    const r = titleMatches("AI Engineer", POSITIVE, NEGATIVE);
    expect(r.relevant).toBe(true);
    expect(r.positive).toBe("ai");
  });

  it("rejects titles hitting a negative keyword", () => {
    const r = titleMatches("Senior Backend Engineer", POSITIVE, NEGATIVE);
    expect(r.relevant).toBe(false);
    expect(r.negative).toBe("senior");
  });

  it("rejects unrelated titles", () => {
    expect(titleMatches("Marketing Manager", POSITIVE, NEGATIVE).relevant).toBe(false);
  });
});

describe("engineeringMatch", () => {
  it("includes roles matching the user's domains + nouns", () => {
    expect(engineeringMatch("Backend Engineer", PREFS).engineering).toBe(true);
    expect(engineeringMatch("AI Engineer", PREFS).engineering).toBe(true);
    expect(engineeringMatch("Forward Deployed Engineer", PREFS).engineering).toBe(true);
  });

  it("excludes roles hitting the user's excluded title keywords", () => {
    expect(engineeringMatch("Sales Engineer", PREFS).engineering).toBe(false);
    expect(engineeringMatch("Data Scientist", PREFS).engineering).toBe(false);
    expect(engineeringMatch("Support Engineer", PREFS).engineering).toBe(false);
  });

  it("rejects every title when no role config is present (fails loudly, not wide)", () => {
    const noRoles = normalizeMatchingPrefs({ preferred_locations: ["india"] });
    expect(engineeringMatch("Software Engineer", noRoles).engineering).toBe(false);
    expect(engineeringMatch("Underwater Basket Weaver", noRoles).engineering).toBe(false);
  });
});

describe("locationMatch", () => {
  it("accepts the user's preferred locations", () => {
    expect(locationMatch("Bengaluru, India", PREFS).eligible).toBe(true);
    expect(locationMatch("Hyderabad", PREFS).preferred).toBe(true);
  });

  it("accepts remote when the user allows it and it is not restricted elsewhere", () => {
    expect(locationMatch("Remote", PREFS).eligible).toBe(true);
  });

  it("rejects remote when the user does not allow it", () => {
    const onsiteOnly = { ...PREFS, remote_ok: false };
    expect(locationMatch("Remote", onsiteOnly).eligible).toBe(false);
    expect(locationMatch("Bengaluru, India", onsiteOnly).eligible).toBe(true);
  });

  it("rejects locations outside the user's preferences", () => {
    expect(locationMatch("San Francisco, CA", PREFS).eligible).toBe(false);
    expect(locationMatch("London, UK", PREFS).eligible).toBe(false);
  });

  it("accepts remote that also lists a preferred location", () => {
    expect(locationMatch("Remote (US / India)", PREFS).eligible).toBe(true);
  });
});

describe("isHighSignal", () => {
  const base = { company: "Acme", url: "https://x", source: "s" };

  it("accepts a strong, location-eligible, junior-enough role", () => {
    expect(
      isHighSignal({ ...base, title: "AI Engineer", location: "Bengaluru, India" }, PREFS),
    ).toBe(true);
  });

  it("rejects titles above the user's seniority ceiling", () => {
    expect(
      isHighSignal({ ...base, title: "Senior Software Engineer", location: "Remote India" }, PREFS),
    ).toBe(false);
  });

  it("allows senior titles when the user has no seniority ceiling", () => {
    const noCeiling = { ...PREFS, seniority_exclusions: [] };
    expect(
      isHighSignal(
        { ...base, title: "Staff Software Engineer", location: "Remote India" },
        noCeiling,
      ),
    ).toBe(true);
  });

  it("rejects eligible location but excluded title", () => {
    expect(isHighSignal({ ...base, title: "Sales Manager", location: "India" }, PREFS)).toBe(false);
  });

  it("rejects strong title but ineligible location", () => {
    expect(isHighSignal({ ...base, title: "AI Engineer", location: "San Francisco" }, PREFS)).toBe(
      false,
    );
  });
});

describe("normalizeMatchingPrefs", () => {
  it("fills defaults for a missing record", () => {
    const p = normalizeMatchingPrefs(undefined);
    expect(p.remote_ok).toBe(true);
    expect(p.preferred_locations).toEqual([]);
    expect(p.exclude_titles).toEqual([]);
  });
});

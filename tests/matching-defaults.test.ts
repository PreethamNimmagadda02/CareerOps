import { describe, expect, it } from "vitest";

import { buildMatchingPrefs } from "../web/lib/matching-defaults.ts";

describe("buildMatchingPrefs", () => {
  it("splits titles into role_domains/role_nouns and keeps include_titles verbatim", () => {
    const m = buildMatchingPrefs({
      titles: ["Backend Engineer", "Machine Learning Engineer"],
      locations: ["Bengaluru", "India"],
      remoteOk: true,
    });
    expect(m.role_domains.sort()).toEqual(["backend", "machine learning"]);
    expect(m.role_nouns).toEqual(["engineer"]);
    expect(m.include_titles).toEqual(["backend engineer", "machine learning engineer"]);
  });

  it("falls back to include_titles only when a title has no recognized trailing noun", () => {
    const m = buildMatchingPrefs({ titles: ["Founder"], locations: [], remoteOk: true });
    expect(m.role_domains).toEqual([]);
    expect(m.role_nouns).toEqual([]);
    expect(m.include_titles).toEqual(["founder"]);
  });

  it("mirrors the avoid list into both exclude_titles and seniority_exclusions", () => {
    const m = buildMatchingPrefs({
      titles: ["Software Engineer"],
      avoid: ["Sales", "Senior", "Staff"],
      locations: ["Remote"],
      remoteOk: true,
    });
    expect(m.exclude_titles).toEqual(["sales", "senior", "staff"]);
    expect(m.seniority_exclusions).toEqual(["sales", "senior", "staff"]);
  });

  it("defaults avoid to an empty list when omitted", () => {
    const m = buildMatchingPrefs({ titles: ["Engineer"], locations: [], remoteOk: true });
    expect(m.exclude_titles).toEqual([]);
    expect(m.seniority_exclusions).toEqual([]);
  });

  it("never populates strong_titles, and defaults eligible_locations to an empty list", () => {
    const m = buildMatchingPrefs({
      titles: ["Backend Engineer"],
      avoid: ["senior"],
      locations: ["India"],
      remoteOk: true,
    });
    expect(m.strong_titles).toEqual([]);
    expect(m.eligible_locations).toEqual([]);
  });

  it("lowercases, trims, and dedupes eligible_locations", () => {
    const m = buildMatchingPrefs({
      titles: ["Backend Engineer"],
      locations: ["India"],
      remoteOk: true,
      eligibleLocations: ["India", " india", "UNITED STATES"],
    });
    expect(m.eligible_locations).toEqual(["india", "united states"]);
  });

  it("lowercases, trims, and dedupes titles, avoid, and locations", () => {
    const m = buildMatchingPrefs({
      titles: [" Backend Engineer ", "backend engineer", "Backend Engineer"],
      avoid: ["Senior", "senior "],
      locations: ["India", " india", "INDIA"],
      remoteOk: true,
    });
    expect(m.include_titles).toEqual(["backend engineer"]);
    expect(m.exclude_titles).toEqual(["senior"]);
    expect(m.preferred_locations).toEqual(["india"]);
  });

  it("drops empty/whitespace-only entries", () => {
    const m = buildMatchingPrefs({ titles: ["", "  ", "Engineer"], locations: ["", "India"], remoteOk: true });
    expect(m.include_titles).toEqual(["engineer"]);
    expect(m.preferred_locations).toEqual(["india"]);
  });

  it("passes remoteOk straight through", () => {
    expect(buildMatchingPrefs({ titles: [], locations: [], remoteOk: false }).remote_ok).toBe(false);
    expect(buildMatchingPrefs({ titles: [], locations: [], remoteOk: true }).remote_ok).toBe(true);
  });

  it("returns a fully-formed object with empty lists when given no titles or locations", () => {
    const m = buildMatchingPrefs({ titles: [], locations: [], remoteOk: true });
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

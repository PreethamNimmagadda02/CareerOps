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

  it("strips a seniority prefix from the domain so the level doesn't narrow the funnel", () => {
    // Left in, the domain would be "senior backend" and a plain "Backend
    // Engineer" posting would no longer match at all.
    const m = buildMatchingPrefs({ titles: ["Senior Backend Engineer"], locations: [], remoteOk: true });
    expect(m.role_domains).toEqual(["backend"]);
    expect(m.role_nouns).toEqual(["engineer"]);
    // The full phrase is still kept verbatim for exact-title matching.
    expect(m.include_titles).toEqual(["senior backend engineer"]);
  });

  it("strips seniority prefixes from a multi-word domain", () => {
    const m = buildMatchingPrefs({
      titles: ["Staff Machine Learning Engineer"],
      locations: [],
      remoteOk: true,
    });
    expect(m.role_domains).toEqual(["machine learning"]);
  });

  it("collapses seniority variants of the same role to one domain", () => {
    const m = buildMatchingPrefs({
      titles: ["Junior Data Engineer", "Data Engineer", "Principal Data Engineer"],
      locations: [],
      remoteOk: true,
    });
    expect(m.role_domains).toEqual(["data"]);
  });

  it("keeps a seniority word that is itself the trailing role noun", () => {
    // "lead" is stripped from a domain, but "Tech Lead" ends in it — there the
    // word is the role noun and must survive.
    const m = buildMatchingPrefs({ titles: ["Tech Lead"], locations: [], remoteOk: true });
    expect(m.role_domains).toEqual(["tech"]);
    expect(m.role_nouns).toEqual(["lead"]);
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

  it("drops an avoid keyword that appears in one of the candidate's own titles", () => {
    // Excluding "lead" here would veto "Lead Data Engineer" itself and leave
    // the candidate matching nothing at all.
    const m = buildMatchingPrefs({
      titles: ["Lead Data Engineer"],
      avoid: ["lead", "intern", "director"],
      locations: ["Remote"],
      remoteOk: true,
    });
    expect(m.exclude_titles).toEqual(["intern", "director"]);
    expect(m.seniority_exclusions).toEqual(["intern", "director"]);
  });

  it("keeps an avoid keyword that only appears as a substring of a target title word", () => {
    // "engineer" contains "engine", but a word-boundary match is what the scan
    // matchers use, so "engine" is not a real collision.
    const m = buildMatchingPrefs({
      titles: ["Backend Engineer"],
      avoid: ["engine"],
      locations: [],
      remoteOk: true,
    });
    expect(m.exclude_titles).toEqual(["engine"]);
  });

  it("drops a colliding avoid keyword regardless of casing", () => {
    const m = buildMatchingPrefs({
      titles: ["Senior Backend Engineer"],
      avoid: ["SENIOR", "junior"],
      locations: [],
      remoteOk: true,
    });
    expect(m.exclude_titles).toEqual(["junior"]);
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

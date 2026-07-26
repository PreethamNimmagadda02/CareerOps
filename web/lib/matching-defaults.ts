/**
 * Shared, framework-agnostic helpers for turning simple, user-friendly input
 * (job titles, locations) into the full `MatchingPrefs` shape the scan
 * matchers expect (src/lib/matching.ts). Pure functions only — no Node/DOM
 * APIs — so this module is safe to import from both server code (API routes,
 * `web/lib/resume-extract.ts`) and client components (the profile page).
 *
 * Two entry points:
 *   - `buildMatchingPrefs()` — the manual-entry path. The "Job Matching"
 *     profile section only exposes a handful of fields (target titles,
 *     locations, remote toggle, an "avoid" list); this expands them into the
 *     full 9-field `MatchingPrefs` record.
 *   - `deriveMatchingDefaults()` — the résumé auto-fill path. Same
 *     expansion, sourced from the LLM-extracted profile fields instead of a
 *     manual form.
 *
 * Both are intentionally permissive: `strong_titles` and `excluded_locations`
 * are never populated automatically (empty = no extra restriction), and
 * `avoid` keywords are mirrored into both `exclude_titles` (drops the job
 * before it's even considered "relevant") and `seniority_exclusions` (belt &
 * suspenders — also keeps it out of the high-signal shortlist).
 *
 * The one place they are not permissive is `withoutSelfCollisions`: an `avoid`
 * keyword that also appears in one of the candidate's own target titles is
 * dropped, because `exclude_titles` vetoes a match outright and the overlap
 * would otherwise silence the roles the candidate is actually looking for.
 *
 * Seniority is deliberately kept out of the discipline matching: `splitTitle`
 * strips level markers ("senior", "staff", …) from the domain phrase, so a
 * target of "Staff Data Engineer" matches plain "Data Engineer" postings.
 * Filtering by level is `exclude_titles` / `seniority_exclusions`' job, not the
 * domain's.
 */

import type { MatchingPrefs } from "../../src/lib/profile-store";

/** Common trailing "role noun" words used to split a title into domain + noun. */
const ROLE_NOUN_WORDS = new Set([
  "engineer", "engineering", "developer", "architect", "scientist",
  "analyst", "manager", "designer", "specialist", "consultant",
  "administrator", "technician", "strategist", "lead", "director",
]);

/**
 * Seniority markers that can prefix a title. These describe the *level*, not
 * the discipline, so they must not leak into the domain phrase: left in,
 * "Staff Machine Learning Engineer" yields the domain "staff machine learning",
 * whose word-boundary regex then fails to match a plain "Machine Learning
 * Engineer" posting — the funnel silently matches almost nothing.
 *
 * Only stripped from the words *before* the trailing role noun, so a title
 * where the marker is itself the noun (e.g. "Tech Lead") keeps working.
 */
const SENIORITY_WORDS = new Set([
  "junior", "jr", "entry", "entry-level", "associate", "mid", "mid-level",
  "senior", "sr", "staff", "principal", "distinguished", "fellow", "lead",
]);

/**
 * Split a free-form job title into a domain phrase + a role noun, e.g.
 * "Machine Learning Engineer" → { domain: "machine learning", noun: "engineer" }.
 * Seniority prefixes are dropped from the domain, so "Senior Backend Engineer"
 * and "Backend Engineer" both yield the domain "backend".
 * Returns `{}` when the title doesn't end in a recognized role noun (e.g.
 * "Founder", "CTO") — such titles still count via `include_titles`.
 */
function splitTitle(title: string): { domain?: string; noun?: string } {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return {};
  const last = words[words.length - 1];
  if (!ROLE_NOUN_WORDS.has(last)) return {};
  const domain = words
    .slice(0, -1)
    .filter((w) => !SENIORITY_WORDS.has(w))
    .join(" ")
    .trim();
  return { domain: domain || undefined, noun: last };
}

/** Split a free-form location string ("Bengaluru, Karnataka, India") into lowercase tokens. */
function locationTokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1);
}

function uniqueLower(values: (string | undefined)[]): string[] {
  return [...new Set(values.map((v) => (v ?? "").trim().toLowerCase()).filter(Boolean))];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Drop "avoid" keywords that also occur inside one of the candidate's own
 * target titles.
 *
 * `exclude_titles` is a veto in the matcher — `engineeringMatch` returns
 * `included && !excluded` (src/lib/matching.ts) — so an overlap is not a
 * partial de-prioritization, it silently zeroes out the candidate's own target
 * roles: a candidate targeting "Lead Data Engineer" who also avoids "lead"
 * would match nothing at all. Seniority inference (manual or LLM-derived) is
 * exactly where that overlap shows up, so the two lists are reconciled here
 * rather than trusted to whatever produced them.
 *
 * Matching uses the same case-insensitive word-boundary test the scan matchers
 * compile, so a term is only dropped when it would really fire on that title.
 */
function withoutSelfCollisions(avoid: string[], titles: string[]): string[] {
  if (avoid.length === 0 || titles.length === 0) return avoid;
  return avoid.filter((term) => {
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    return !titles.some((title) => re.test(title));
  });
}

/**
 * Build a full `MatchingPrefs` record from already-clean, discrete inputs —
 * the shape the simplified "Job Matching" profile form collects.
 */
export function buildMatchingPrefs(input: {
  /** Job titles the candidate wants (drives role_domains, role_nouns, include_titles). */
  titles: string[];
  /** Keywords/titles to avoid entirely (e.g. "sales", "senior", "recruiter"). */
  avoid?: string[];
  /** Locations the candidate can work from. */
  locations: string[];
  /** Whether remote roles are acceptable. */
  remoteOk: boolean;
  /** Countries the candidate is eligible to work in without a visa (optional). */
  eligibleLocations?: string[];
}): MatchingPrefs {
  const cleanTitles = uniqueLower(input.titles);
  const domains = new Set<string>();
  const nouns = new Set<string>();
  for (const title of cleanTitles) {
    const { domain, noun } = splitTitle(title);
    if (domain) domains.add(domain);
    if (noun) nouns.add(noun);
  }
  const cleanAvoid = withoutSelfCollisions(uniqueLower(input.avoid ?? []), cleanTitles);

  return {
    role_domains: [...domains],
    role_nouns: [...nouns],
    include_titles: cleanTitles,
    exclude_titles: cleanAvoid,
    strong_titles: [],
    seniority_exclusions: cleanAvoid,
    preferred_locations: uniqueLower(input.locations),
    remote_ok: input.remoteOk,
    eligible_locations: uniqueLower(input.eligibleLocations ?? []),
  };
}

/**
 * Résumé auto-fill path: derive the same `MatchingPrefs` defaults from
 * free-text fields the LLM extraction already produces reliably (target
 * roles/archetypes, candidate location, structured location). Locations here
 * may be comma-separated free text ("Bengaluru, Karnataka, India"), unlike
 * `buildMatchingPrefs`'s already-discrete chip values.
 *
 * `target_roles.primary` is deliberately a wide list — the extraction prompt
 * asks for naming variants and adjacent roles, not just the titles the
 * candidate has held. Note that domains and nouns recombine freely in
 * `engineeringMatch` (it tests "any domain" AND "any noun", not the original
 * pairings), so titles like "Backend Engineer" + "Data Scientist" also admit
 * "Data Engineer". That cross-product is the intended widening; the funnel it
 * feeds (`relevant`) is broader than the shortlist by design.
 */
export function deriveMatchingDefaults(profile: {
  target_roles?: { primary?: string[]; archetypes?: Array<{ name: string }>; avoid?: string[] };
  candidate?: { location?: string };
  location?: { city?: string; country?: string };
}): MatchingPrefs {
  const titles = [
    ...(profile.target_roles?.primary ?? []),
    ...(profile.target_roles?.archetypes ?? []).map((a) => a.name),
  ];
  const avoid = profile.target_roles?.avoid ?? [];
  const locations = [
    ...locationTokens(profile.candidate?.location),
    ...locationTokens(profile.location?.city),
    ...locationTokens(profile.location?.country),
  ];
  return buildMatchingPrefs({ titles, avoid, locations, remoteOk: true });
}

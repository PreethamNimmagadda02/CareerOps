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
 */

import type { MatchingPrefs } from "../../src/lib/profile-store";

/** Common trailing "role noun" words used to split a title into domain + noun. */
const ROLE_NOUN_WORDS = new Set([
  "engineer", "engineering", "developer", "architect", "scientist",
  "analyst", "manager", "designer", "specialist", "consultant",
  "administrator", "technician", "strategist", "lead", "director",
]);

/**
 * Split a free-form job title into a domain phrase + a role noun, e.g.
 * "Machine Learning Engineer" → { domain: "machine learning", noun: "engineer" }.
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
  const domain = words.slice(0, -1).join(" ").trim();
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
}): MatchingPrefs {
  const cleanTitles = uniqueLower(input.titles);
  const domains = new Set<string>();
  const nouns = new Set<string>();
  for (const title of cleanTitles) {
    const { domain, noun } = splitTitle(title);
    if (domain) domains.add(domain);
    if (noun) nouns.add(noun);
  }
  const cleanAvoid = uniqueLower(input.avoid ?? []);

  return {
    role_domains: [...domains],
    role_nouns: [...nouns],
    include_titles: cleanTitles,
    exclude_titles: cleanAvoid,
    strong_titles: [],
    seniority_exclusions: cleanAvoid,
    preferred_locations: uniqueLower(input.locations),
    remote_ok: input.remoteOk,
    excluded_locations: [],
  };
}

/**
 * Résumé auto-fill path: derive the same `MatchingPrefs` defaults from
 * free-text fields the LLM extraction already produces reliably (target
 * roles/archetypes, candidate location, structured location). Locations here
 * may be comma-separated free text ("Bengaluru, Karnataka, India"), unlike
 * `buildMatchingPrefs`'s already-discrete chip values.
 */
export function deriveMatchingDefaults(profile: {
  target_roles?: { primary?: string[]; archetypes?: Array<{ name: string }> };
  candidate?: { location?: string };
  location?: { city?: string; country?: string };
}): MatchingPrefs {
  const titles = [
    ...(profile.target_roles?.primary ?? []),
    ...(profile.target_roles?.archetypes ?? []).map((a) => a.name),
  ];
  const locations = [
    ...locationTokens(profile.candidate?.location),
    ...locationTokens(profile.location?.city),
    ...locationTokens(profile.location?.country),
  ];
  return buildMatchingPrefs({ titles, locations, remoteOk: true });
}

import type { EngineeringMatch, Job, LocationMatch, TitleMatch } from "../types.js";
import type { MatchingPrefs } from "./profile-store.js";
import { keywordMatch } from "./text.js";

/**
 * All matchers in this module are driven entirely by the per-user
 * `MatchingPrefs` stored in the candidate's profile (DynamoDB). No candidate
 * detail is hardcoded here, so the same pipeline scales to any number of
 * users with different roles, seniorities, and locations.
 */

// ─── Keyword → regex helpers ─────────────────────────────────────────────────

/**
 * Maximum number of keywords that will be compiled into a single matcher
 * regex. Caps the cost of alternation evaluation so a misconfigured or abusive
 * profile cannot produce pathological matching. Extra entries are dropped (and
 * the scan continues with the first N). Keep this comfortably above any
 * reasonable single-user config.
 */
const MAX_KEYWORDS = 200;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a list of user-entered keywords/phrases into a single
 * case-insensitive word-boundary regex. Returns null when the list is empty
 * so callers can distinguish "not configured" from "no match".
 */
function keywordRegex(words: string[] | undefined): RegExp | null {
  const cleaned = (words ?? []).map((w) => w.trim()).filter(Boolean).slice(0, MAX_KEYWORDS);
  if (cleaned.length === 0) return null;
  return new RegExp(`\\b(${cleaned.map(escapeRegex).join("|")})\\b`, "i");
}

/** Generic remote-work markers — not candidate-specific. */
const REMOTE_RE = /\b(remote|remote-first|work from home|wfh|distributed)\b/i;

/** Markers that explicitly call out a remote role as having no geographic restriction. */
const WORLDWIDE_RE = /\b(worldwide|anywhere|global|international)\b/i;

/**
 * Split a raw qualifier fragment ("US / India", "US only", "EMEA") into
 * cleaned, lowercase country/region tokens.
 */
function splitQualifier(raw: string): string[] {
  return raw
    .replace(/\bonly\b/gi, "")
    .split(/[/,&]|\band\b/i)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Determine whether a remote-labeled location string restricts the role to
 * specific countries/regions (e.g. "Remote (US / India)", "Remote - US only",
 * "US Remote"), and if so, extract those tokens.
 *
 * Returns `null` if the string isn't remote at all, `[]` if it's remote with
 * no restriction (worldwide — e.g. bare "Remote" or "Remote, Worldwide"), or
 * a non-empty array of country/region tokens the role is restricted to.
 */
function remoteRestriction(text: string): string[] | null {
  if (!REMOTE_RE.test(text)) return null;
  if (WORLDWIDE_RE.test(text)) return [];

  // "Remote (US / India)" — qualifier in parentheses.
  const paren = text.match(/\(([^)]+)\)/);
  if (paren) return splitQualifier(paren[1]);

  // "Remote - US only" / "Remote, US" / "Remote: US"
  const after = text.match(/\bremote\b[\s-]*[,:-]\s*([a-z][a-z\s/&]*)/i);
  if (after) return splitQualifier(after[1]);

  // "US Remote" — qualifier precedes "remote".
  const before = text.match(/^([a-z][a-z\s/&]*?)\s+remote\b/i);
  if (before) return splitQualifier(before[1]);

  // "Remote US" / "Remote India" — qualifier follows with no delimiter.
  const direct = text.match(/\bremote\b\s+([a-z][a-z\s/&]*)/i);
  if (direct) return splitQualifier(direct[1]);

  // Bare "Remote" with no qualifier at all — worldwide.
  return [];
}

/**
 * Fill in defaults for a possibly partial `matching` record so the matchers
 * can rely on every field being present. Empty include-lists mean "no
 * restriction"; empty exclude-lists mean "exclude nothing".
 */
export function normalizeMatchingPrefs(prefs: Partial<MatchingPrefs> | undefined): MatchingPrefs {
  return {
    role_domains: prefs?.role_domains ?? [],
    role_nouns: prefs?.role_nouns ?? [],
    include_titles: prefs?.include_titles ?? [],
    exclude_titles: prefs?.exclude_titles ?? [],
    strong_titles: prefs?.strong_titles ?? [],
    seniority_exclusions: prefs?.seniority_exclusions ?? [],
    preferred_locations: prefs?.preferred_locations ?? [],
    remote_ok: prefs?.remote_ok ?? true,
    visa_status: prefs?.visa_status,
    eligible_locations: prefs?.eligible_locations ?? [],
  };
}

// ─── Matchers ────────────────────────────────────────────────────────────────

/** Determine whether a title is relevant based on positive/negative keywords. */
export function titleMatches(title: string, positive: string[], negative: string[]): TitleMatch {
  const lower = title.toLowerCase();
  const pos = positive.find((kw) => keywordMatch(lower, kw));
  const neg = negative.find((kw) => keywordMatch(lower, kw));
  return { relevant: Boolean(pos) && !neg, positive: pos || "", negative: neg || "" };
}

/**
 * Classify whether a title is within the user's target discipline (and not an
 * excluded role). A title is in-scope when it either combines a domain keyword
 * with a role noun (e.g. "backend" + "engineer") or matches one of the
 * explicit include phrases.
 *
 * When the user configured no role indicators at all (no domains, nouns, or
 * include titles) nothing is considered in-scope. That case is also blocked
 * upstream by `validateMatchingReadiness`, which requires at least one role
 * indicator before a scan can run — so a misconfigured profile fails loudly
 * rather than silently widening the funnel.
 */
export function engineeringMatch(title: string, prefs: MatchingPrefs): EngineeringMatch {
  const domainRe = keywordRegex(prefs.role_domains);
  const nounRe = keywordRegex(prefs.role_nouns);
  const includeRe = keywordRegex(prefs.include_titles);

  const domainAndNoun =
    domainRe && nounRe
      ? domainRe.test(title) && nounRe.test(title)
      : (domainRe?.test(title) ?? nounRe?.test(title) ?? false);
  const included = domainAndNoun || (includeRe?.test(title) ?? false);

  const excluded = keywordRegex(prefs.exclude_titles)?.test(title) ?? false;
  return { engineering: included && !excluded, excluded };
}

/**
 * Determine location eligibility from a location string, based on the user's
 * preferred locations, remote preference, and (for country-restricted remote
 * roles) the countries the user is eligible to work in without a visa.
 *
 * Remote roles come in two flavors:
 *   - Worldwide remote (e.g. "Remote", "Remote, Worldwide") — always eligible
 *     when the user allows remote roles, since no work visa is required.
 *   - Country-restricted remote (e.g. "Remote (US)", "Remote - India only")
 *     — only eligible when one of the restricted countries is one of the
 *     user's preferred or eligible-to-work-in locations, since otherwise the
 *     user would need a work visa for that country.
 */
export function locationMatch(
  location: string | undefined,
  prefs: MatchingPrefs,
): LocationMatch {
  const text = String(location || "");
  const preferred = keywordRegex(prefs.preferred_locations)?.test(text) ?? false;
  const remote = REMOTE_RE.test(text);

  const restriction = remoteRestriction(text);
  const restrictedCountries = restriction ?? [];
  const eligibleRe = keywordRegex([
    ...(prefs.preferred_locations ?? []),
    ...(prefs.eligible_locations ?? []),
  ]);
  // Worldwide remote (no restriction) needs no visa; country-restricted
  // remote only counts if the user can legally work in one of those countries.
  const restrictionOk =
    restrictedCountries.length === 0 ||
    restrictedCountries.some((c) => eligibleRe?.test(c) ?? false);

  const remoteEligible = prefs.remote_ok && remote && restrictionOk;
  const eligible = preferred || remoteEligible;
  return { eligible, preferred, remote };
}

/**
 * A job is "high signal" when it is an in-scope role with a strong title,
 * no excluded keywords, an eligible location, and not above the user's
 * seniority ceiling. All thresholds come from the user's profile.
 */
export function isHighSignal(job: Job, prefs: MatchingPrefs): boolean {
  const strongRe = keywordRegex(prefs.strong_titles);
  const strongTitle = strongRe ? strongRe.test(job.title) : true;

  const weakTitle = keywordRegex(prefs.exclude_titles)?.test(job.title) ?? false;

  const friendlyLocation = locationMatch(job.location, prefs).eligible;

  const tooSenior = keywordRegex(prefs.seniority_exclusions)?.test(job.title) ?? false;

  return (
    engineeringMatch(job.title, prefs).engineering &&
    strongTitle &&
    !weakTitle &&
    friendlyLocation &&
    !tooSenior
  );
}

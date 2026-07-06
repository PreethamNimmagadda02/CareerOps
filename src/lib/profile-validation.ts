/**
 * Candidate readiness validation.
 *
 * Shared by the evaluate CLI and the web pipeline pre-flight so both enforce
 * the same minimum data before an evaluation is allowed to run. An evaluation
 * compares the candidate against a job description, so it is meaningless when
 * the core profile/CV fields are blank.
 */

import type { CV } from "./cv-store.js";
import type { Profile } from "./profile-store.js";

export interface ReadinessResult {
  ok: boolean;
  /** Human-readable list of what's missing, e.g. "Full name". */
  missing: string[];
}

const filled = (s: unknown): boolean => typeof s === "string" && s.trim().length > 0;

/**
 * The minimum profile + CV data required for a meaningful evaluation.
 * Returns `{ ok: false, missing: [...] }` listing every absent field.
 */
export function validateCandidateReadiness(
  profile: Profile | null,
  cv: CV | null,
): ReadinessResult {
  const missing: string[] = [];

  if (!profile) {
    missing.push("Your profile has not been set up yet");
  } else {
    if (!filled(profile.candidate?.full_name)) missing.push("Full name (Personal Info)");
    if (!filled(profile.narrative?.headline))
      missing.push("Professional headline (Career Profile)");
    if (!profile.target_roles?.primary?.length)
      missing.push("At least one target role (Career Profile)");
  }

  if (!cv) {
    missing.push("Your CV details have not been set up yet");
  } else {
    const hasSummary = filled(cv.summary);
    const hasExperience = (cv.experience?.length ?? 0) > 0;
    if (!hasSummary && !hasExperience) {
      missing.push("A professional summary or at least one work experience");
    }
    if (!cv.skills?.length) missing.push("At least one skill");
  }

  return { ok: missing.length === 0, missing };
}

/**
 * The minimum job-matching preferences required before a scan can run.
 * The scan matchers are driven entirely by the profile's "Job Matching"
 * section, so a scan without it would either match nothing or match jobs the
 * candidate cannot take. Requires both a role indicator (so non-target roles
 * are filtered out) and a location indicator (so geographic eligibility is
 * meaningful). Everything beyond that is an optional refinement.
 */
export function validateMatchingReadiness(profile: Profile | null): ReadinessResult {
  const missing: string[] = [];

  if (!profile) {
    missing.push("Your profile has not been set up yet");
    return { ok: false, missing };
  }

  const m = profile.matching;
  if (!m) {
    missing.push("Job matching preferences (Job Matching section of your profile)");
    return { ok: false, missing };
  }

  const hasRoleConfig =
    (m.role_domains?.length ?? 0) > 0 ||
    (m.role_nouns?.length ?? 0) > 0 ||
    (m.include_titles?.length ?? 0) > 0;
  if (!hasRoleConfig) {
    missing.push("At least one role indicator (Job Matching section — discipline keywords, role nouns, or include titles)");
  }

  const hasLocationConfig = (m.preferred_locations?.length ?? 0) > 0 || m.remote_ok !== false;
  if (!hasLocationConfig) {
    missing.push("At least one preferred location — or allow remote roles (Job Matching section)");
  }

  return { ok: missing.length === 0, missing };
}

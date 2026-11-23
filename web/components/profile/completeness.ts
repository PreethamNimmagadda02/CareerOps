import type { CvData, MatchingData, ProfileData } from "./types";

// ── Sections ────────────────────────────────────────────────────────────────
//
// The ids double as deep-link anchors (e.g. `/profile#section-matching` from
// the dashboard and the onboarding reveal step) — keep them stable even when
// the visible names change.

export interface SectionNavItem {
  id: string;
  label: string;
}

export const SECTION_NAV: SectionNavItem[] = [
  { id: "section-basics", label: "About you" },
  { id: "section-matching", label: "What you're looking for" },
  { id: "section-career", label: "Your story" },
  { id: "section-experience", label: "Work history" },
  { id: "section-skills", label: "Skills & languages" },
  { id: "section-education", label: "Education" },
  { id: "section-projects", label: "Projects" },
];

/**
 * Old section ids that were folded into another section. A link to one still
 * opens the section that now holds its fields ("Pay & location" now lives in
 * "What you're looking for", under "Pay and other details").
 */
export const SECTION_ALIASES: Record<string, string> = {
  "section-work": "section-matching",
};

/** Anchor of the résumé card (it sits above the sections, always visible). */
export const RESUME_ANCHOR = "section-resume";

// ── Profile completeness ─────────────────────────────────────────────────────
//
// Lightweight client-side mirror of the server-side readiness checks
// (src/lib/profile-validation.ts). Kept intentionally simple — this only
// drives UI hints (progress bar, "what's missing" list); the server remains
// the source of truth for whether a scan/evaluation is actually allowed to run.

export function isFilled(s: string | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

export function hasRoleIndicator(m: MatchingData | undefined): boolean {
  return Boolean(m?.role_domains?.length || m?.role_nouns?.length || m?.include_titles?.length);
}

/** Same rule as validateMatchingReadiness: a saved place, or remote not turned off. */
export function hasLocationIndicator(m: MatchingData | undefined): boolean {
  return Boolean(m && ((m.preferred_locations?.length ?? 0) > 0 || m.remote_ok !== false));
}

/** Whether the job search has what it needs to run (a job and a place). */
export function isSearchReady(m: MatchingData | undefined): boolean {
  return hasRoleIndicator(m) && hasLocationIndicator(m);
}

/**
 * The one "Jobs you want" list. It used to be asked for twice — as
 * `target_roles.primary` (used to check how well a job fits, and on résumés)
 * and as `matching.include_titles` (what the job search looks for). Show
 * everything from both so saving the merged list never drops a title either
 * place was using. `include_titles` is stored lowercased, so prefer the
 * spelling from `primary` or a role type when the same title is in both.
 */
export function mergedJobTitles(p: ProfileData): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (title: string | undefined) => {
    const t = title?.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(t);
  };
  const niceSpelling = new Map(
    (p.target_roles?.archetypes ?? []).filter((a) => isFilled(a.name)).map((a) => [a.name.trim().toLowerCase(), a.name.trim()]),
  );
  for (const t of p.target_roles?.primary ?? []) add(t);
  for (const t of p.matching?.include_titles ?? []) add(niceSpelling.get(t.trim().toLowerCase()) ?? t);
  return out;
}

/**
 * True when "Jobs you want" shows titles that aren't saved in both places yet
 * (e.g. they were only ever added under the old "Career goals" or "Job search
 * settings"). One save from the merged section fixes it.
 */
export function jobTitlesNeedSaving(p: ProfileData): boolean {
  return mergedJobTitles(p).length > 0 && (!(p.target_roles?.primary?.length ?? 0) || !hasRoleIndicator(p.matching));
}

export interface ChecklistItem {
  /** Where the item is fixed: a section id, or the résumé card. */
  id: string;
  label: string;
  done: boolean;
}

export function buildChecklist(p: ProfileData, c: CvData, resumeKey: string | null): ChecklistItem[] {
  return [
    { id: RESUME_ANCHOR, label: "Upload your résumé", done: Boolean(resumeKey) },
    {
      id: "section-basics",
      label: "Add your name and where you live",
      done: isFilled(p.candidate?.full_name) && isFilled(p.candidate?.location),
    },
    {
      // The fit check needs target_roles.primary; the job search needs the
      // matching prefs. "Jobs you want" saves both at once.
      id: "section-matching",
      label: "Add the jobs you want and where you'd like to work",
      done: (p.target_roles?.primary?.length ?? 0) > 0 && isSearchReady(p.matching),
    },
    {
      id: "section-career",
      label: "Write one line about you",
      done: isFilled(p.narrative?.headline),
    },
    {
      // The summary lives inside "Your story" (it's the same text as
      // narrative.exit_story — see startCareer/onSave in profile-view.tsx).
      id: "section-career",
      label: "Write a short summary about you",
      done: isFilled(c.summary) || (c.experience?.length ?? 0) > 0,
    },
    { id: "section-skills", label: "Add your skills", done: (c.skills?.length ?? 0) > 0 },
  ];
}

/**
 * Where each section stands, shown next to it in the section list:
 * - "done": everything the checklist asks for here is filled in (or, for
 *   sections the checklist doesn't cover, it holds something);
 * - "needed": the checklist still wants something from this section;
 * - "optional": nothing added yet, and nothing here is required.
 */
export type SectionState = "done" | "needed" | "optional";

export function buildSectionStates(
  checklist: ChecklistItem[],
  c: CvData,
): Record<string, SectionState> {
  const states: Record<string, SectionState> = {};
  for (const s of SECTION_NAV) {
    const items = checklist.filter((i) => i.id === s.id);
    if (items.length > 0) states[s.id] = items.every((i) => i.done) ? "done" : "needed";
  }
  const filledOrOptional = (filled: boolean): SectionState => (filled ? "done" : "optional");
  states["section-experience"] = filledOrOptional((c.experience?.length ?? 0) > 0);
  states["section-education"] = filledOrOptional((c.education?.length ?? 0) + (c.certifications?.length ?? 0) > 0);
  states["section-projects"] = filledOrOptional((c.projects?.length ?? 0) > 0);
  return states;
}

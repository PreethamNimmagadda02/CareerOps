"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { MetadataListItem } from "@astryxdesign/core/MetadataList";
import { RadioListItem } from "@astryxdesign/core/RadioList";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { Page, PageHeader } from "@/components/page";
import {
  RESUME_ANCHOR,
  SECTION_ALIASES,
  SECTION_NAV,
  buildChecklist,
  buildSectionStates,
  isFilled,
  isSearchReady,
  jobTitlesNeedSaving,
  mergedJobTitles,
} from "@/components/profile/completeness";
import {
  BulletList,
  ChoiceList,
  CurrencyField,
  EntryBlock,
  EntryGroup,
  FieldGrid,
  InfoItem,
  InfoList,
  LinesField,
  MoreDetails,
  SectionCard,
  TagField,
  TagItem,
  TextAreaField,
  TextField,
  TimeZoneField,
  ValueText,
  currencyLabel,
  detectTimeZone,
  timeZoneLabel,
} from "@/components/profile/fields";
import { ResumeCard } from "@/components/profile/resume-card";
import { CompletenessCard, SectionList, type SectionMarker } from "@/components/profile/section-nav";
import {
  SECTION_LABEL,
  type Archetype,
  type Certification,
  type CvData,
  type Education,
  type Experience,
  type Language,
  type ProfileData,
  type Project,
  type ProofPoint,
  type SectionKey,
  type SkillGroup,
  type UserData,
} from "@/components/profile/types";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { buildMatchingPrefs } from "@/lib/matching-defaults";

const PAGE_DESCRIPTION = "Keep this up to date so we can find the right jobs for you.";

/** Role-type "fit" values (stored as-is) and what the user reads. */
const FIT_OPTIONS = [
  { value: "primary", label: "Top choice" },
  { value: "secondary", label: "Also interested" },
  { value: "adjacent", label: "Open to it" },
];
function fitLabel(fit: string): string {
  return FIT_OPTIONS.find((o) => o.value === fit)?.label ?? fit;
}
function fitOptions(current: string) {
  // Keep an unexpected saved value (e.g. from résumé extraction) selectable.
  return current && !FIT_OPTIONS.some((o) => o.value === current)
    ? [...FIT_OPTIONS, { value: current, label: current }]
    : FIT_OPTIONS;
}

function joinParts(parts: Array<string | undefined>, sep = " · "): string {
  return parts.filter((x) => x && x.trim()).join(sep);
}

/** Phones show the section list and one section as separate screens. */
function isPhoneLayout(): boolean {
  return window.matchMedia("(max-width: 767.98px)").matches;
}

/** The unsaved-changes dialog's "leave" button (its cancel button). */
const LEAVE_LABEL = "Leave without saving";

/** The saved parts (one PATCH each) behind each section in the list. */
const SECTION_KEYS: Record<string, SectionKey[]> = {
  "section-basics": ["account", "personal"],
  "section-matching": ["matching"],
  "section-career": ["career"],
  "section-experience": ["experience"],
  "section-skills": ["skills"],
  "section-education": ["education"],
  "section-projects": ["projects"],
};

/** "“About you” and “Work history”" — section names for a sentence. */
function sectionNames(ids: string[]): string {
  const names = ids.map((id) => `“${SECTION_NAV.find((s) => s.id === id)?.label ?? id}”`);
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}

/** Everything "What you're looking for" edits. */
interface MatchingDraft {
  titles: string[];
  avoid: string[];
  prefLocations: string[];
  eligibleLocations: string[];
  remoteOk: boolean;
  compRange: string;
  compMin: string;
  currency: string;
  locFlex: string;
  timezone: string;
  visaStatus: string;
}

/** "What you're looking for" as saved, ready to edit (or to save again as it is). */
function matchingDraftFrom(p: ProfileData): MatchingDraft {
  const m = p.matching ?? {};
  const comp = p.compensation ?? {};
  const loc = p.location ?? {};
  return {
    // One list for both places job titles used to be asked for — see
    // mergedJobTitles — so saving it never drops a title either one had.
    titles: mergedJobTitles(p),
    // Union of exclude_titles/seniority_exclusions — buildMatchingPrefs always
    // mirrors "avoid" into both, so they're the same list in practice. Prefill
    // from whatever's already saved so a save that only touches, say,
    // locations doesn't silently wipe the avoid list back to empty.
    avoid: [...new Set([...(m.exclude_titles ?? []), ...(m.seniority_exclusions ?? [])])],
    prefLocations: m.preferred_locations ?? [],
    eligibleLocations: m.eligible_locations ?? [],
    remoteOk: m.remote_ok ?? true,
    compRange: comp.target_range ?? "",
    compMin: comp.minimum ?? "",
    currency: comp.currency ?? "",
    // Flexibility and onsite-availability are now one field — merge them so
    // anything already saved under the old, separate field isn't hidden.
    locFlex: [comp.location_flexibility, loc.onsite_availability].filter(Boolean).join(" · "),
    timezone: loc.timezone ?? "",
    visaStatus: loc.visa_status ?? "",
  };
}

/** The PATCH body that saves "What you're looking for" on top of the saved profile `base`. */
function matchingPatch(base: ProfileData, d: MatchingDraft): Record<string, unknown> {
  return {
    profile: {
      // "Jobs you want" is saved to both places that read it, exactly as the
      // two old sections did: target_roles.primary (used to check how well a
      // job fits, and on résumés) and the job-search prefs, expanded by
      // buildMatchingPrefs. Role types stay as saved.
      target_roles: { ...(base.target_roles ?? {}), primary: d.titles },
      matching: buildMatchingPrefs({
        titles: d.titles,
        avoid: d.avoid,
        locations: d.prefLocations,
        remoteOk: d.remoteOk,
        eligibleLocations: d.eligibleLocations,
      }),
      compensation: {
        ...(base.compensation ?? {}),
        target_range: d.compRange,
        minimum: d.compMin,
        currency: d.currency,
        location_flexibility: d.locFlex,
      },
      // City/country live in About you's "Where you live" field — no need
      // to ask for them twice. Onsite availability is now folded into
      // the flexibility text above, so clear the old separate field.
      location: { ...(base.location ?? {}), timezone: d.timezone, visa_status: d.visaStatus, onsite_availability: "" },
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function ProfileView() {
  const toast = useToast();
  const [user, setUser] = React.useState<UserData | null>(null);
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [cv, setCv] = React.useState<CvData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<string>(SECTION_NAV[0].id);
  // Phones only: the list of sections, or one open section. Wider screens
  // always show both side by side.
  const [mobileView, setMobileView] = React.useState<"list" | "section">("list");
  // "Pay and other details" inside "What you're looking for" — opened by an
  // old `#section-work` link, otherwise closed until the person opens it.
  const [payOpen, setPayOpen] = React.useState(false);
  const sectionsRef = React.useRef<HTMLDivElement>(null);
  const backRef = React.useRef<HTMLDivElement>(null);
  const revealSectionRef = React.useRef(false);
  const pendingFocusRef = React.useRef<"back" | "row" | null>(null);
  const router = useRouter();
  // "Search again with these changes?" at the top of "What you're looking
  // for": after a first search found no good matches (`?from=nomatch`), and
  // right after that section is saved (then it can be closed).
  const [findAgain, setFindAgain] = React.useState<"nomatch" | "saved" | null>(null);
  // Where the person was going when we stopped to ask about unsaved changes.
  const [leaveHref, setLeaveHref] = React.useState<string | null>(null);
  const [leaveSaving, setLeaveSaving] = React.useState(false);
  const leaveChosenRef = React.useRef(false);
  // Set once the person has chosen to go, so the browser doesn't ask again.
  const leavingRef = React.useRef(false);
  // The profile as last saved. Saves build their body on it, so saves run one
  // after another (see "Save them" below) never undo the one just before.
  const profileRef = React.useRef<ProfileData | null>(null);
  // Each section's draft as it was when editing started (see "unsaved changes").
  const baselineRef = React.useRef<Record<string, string>>({});

  const [editing, setEditing] = React.useState<Partial<Record<SectionKey, boolean>>>({});
  const [saving, setSaving] = React.useState<Partial<Record<SectionKey, boolean>>>({});
  const [errors, setErrors] = React.useState<Partial<Record<SectionKey, string | null>>>({});

  // ── draft states ───────────────────────────────────────────────────────────
  // personal
  const [draftFullName, setDraftFullName] = React.useState("");
  const [draftPhone, setDraftPhone] = React.useState("");
  const [draftLocation, setDraftLocation] = React.useState("");
  const [draftLinkedin, setDraftLinkedin] = React.useState("");
  const [draftGithub, setDraftGithub] = React.useState("");
  const [draftPortfolio, setDraftPortfolio] = React.useState("");
  const [draftTwitter, setDraftTwitter] = React.useState("");
  const [draftContactEmail, setDraftContactEmail] = React.useState("");
  // career ("Your story")
  const [draftHeadline, setDraftHeadline] = React.useState("");
  const [draftExitStory, setDraftExitStory] = React.useState("");
  const [draftSuperpowers, setDraftSuperpowers] = React.useState<string[]>([]);
  const [draftArchetypes, setDraftArchetypes] = React.useState<Archetype[]>([]);
  const [draftProofPoints, setDraftProofPoints] = React.useState<ProofPoint[]>([]);
  // matching ("What you're looking for") — drives the job-scan matchers
  // (expanded via buildMatchingPrefs); the titles also feed target_roles.primary.
  const [draftTitles, setDraftTitles] = React.useState<string[]>([]);
  const [draftAvoid, setDraftAvoid] = React.useState<string[]>([]);
  const [draftPrefLocations, setDraftPrefLocations] = React.useState<string[]>([]);
  const [draftEligibleLocations, setDraftEligibleLocations] = React.useState<string[]>([]);
  const [draftRemoteOk, setDraftRemoteOk] = React.useState(true);
  // …and its "Pay and other details"
  const [draftCompRange, setDraftCompRange] = React.useState("");
  const [draftCompMin, setDraftCompMin] = React.useState("");
  const [draftCurrency, setDraftCurrency] = React.useState("");
  const [draftLocFlex, setDraftLocFlex] = React.useState("");
  const [draftTimezone, setDraftTimezone] = React.useState("");
  const [draftVisaStatus, setDraftVisaStatus] = React.useState("");
  // cv
  const [draftExperience, setDraftExperience] = React.useState<Experience[]>([]);
  const [draftSkills, setDraftSkills] = React.useState<SkillGroup[]>([]);
  const [draftLanguages, setDraftLanguages] = React.useState<Language[]>([]);
  const [draftEducation, setDraftEducation] = React.useState<Education[]>([]);
  const [draftCertifications, setDraftCertifications] = React.useState<Certification[]>([]);
  const [draftProjects, setDraftProjects] = React.useState<Project[]>([]);

  // ── load ───────────────────────────────────────────────────────────────────

  const load = React.useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setUser(data.user as UserData);
      setProfile((data.profile as ProfileData | null) ?? null);
      setCv((data.cv as CvData | null) ?? null);
    } catch (err) {
      setPageError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Deep-link support (e.g. `/profile#section-matching` from the dashboard's
  // "Adjust keywords" link) — open directly on the linked section instead of
  // always defaulting to the first one (on phones: instead of the section
  // list), and bring it into view once loaded. Old ids of sections that were
  // merged into another one open the section that now holds their fields.
  // `?from=nomatch` (a first search found no good matches) opens "What you're
  // looking for" with a way to search again.
  React.useEffect(() => {
    const fromNoMatch = new URLSearchParams(window.location.search).get("from") === "nomatch";
    const hash = window.location.hash.slice(1);
    const id = fromNoMatch ? "section-matching" : (SECTION_ALIASES[hash] ?? hash);
    if (SECTION_NAV.some((s) => s.id === id)) {
      setActiveSection(id);
      setMobileView("section");
      if (hash === "section-work") setPayOpen(true);
      revealSectionRef.current = true;
    }
    if (fromNoMatch) setFindAgain("nomatch");
  }, []);

  // Only one section is rendered at a time (tab-style navigation). When the
  // user picks another one (or arrives via a deep link), make sure the start
  // of the newly shown section is on screen — the résumé and progress cards
  // sit above it, so it can be scrolled out of view. On phones an opened
  // section is a screen of its own, so it always starts at the top. Switching
  // between the list and a section there also moves keyboard / screen-reader
  // focus along, since the control that was used disappears.
  React.useEffect(() => {
    if (loading) return;
    if (revealSectionRef.current) {
      revealSectionRef.current = false;
      const el = sectionsRef.current;
      if (el) {
        const newScreen = mobileView === "section" && isPhoneLayout();
        const top = el.getBoundingClientRect().top;
        if (newScreen || top < 0 || top > window.innerHeight * 0.7) {
          el.scrollIntoView({ behavior: newScreen ? "auto" : "smooth", block: "start" });
        }
      }
    }
    const focus = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (focus === "back") backRef.current?.querySelector("button")?.focus({ preventScroll: true });
    if (focus === "row")
      document.querySelector<HTMLElement>(`[data-section-row="${activeSection}"]`)?.focus({ preventScroll: true });
  }, [activeSection, mobileView, loading]);

  function goToSection(id: string) {
    if (id === RESUME_ANCHOR) {
      // On phones the résumé card sits on the list screen (it's hidden while
      // a section is open), so go back there first.
      setMobileView("list");
      requestAnimationFrame(() =>
        document.getElementById(RESUME_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
      return;
    }
    revealSectionRef.current = true;
    if (isPhoneLayout()) pendingFocusRef.current = "back";
    setActiveSection(id);
    setMobileView("section");
  }

  function showAllSections() {
    revealSectionRef.current = true;
    pendingFocusRef.current = "row";
    setMobileView("list");
  }

  // ── save helper ────────────────────────────────────────────────────────────
  //
  // PATCH /api/profile replaces each top-level profile key it's sent
  // (candidate, narrative, target_roles, …) as a whole — it does not merge
  // inside them. So every save spreads the saved object for the keys it
  // writes, and only changes the fields its section shows.

  /** Saves one part; true when it worked (a failure shows its error and keeps editing open). */
  async function save(section: SectionKey, body: Record<string, unknown>, opts?: { silent?: boolean }): Promise<boolean> {
    setSaving((s) => ({ ...s, [section]: true }));
    setErrors((e) => ({ ...e, [section]: null }));
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const saved = (data.profile as ProfileData | null) ?? null;
      profileRef.current = saved;
      setUser(data.user as UserData);
      setProfile(saved);
      setCv((data.cv as CvData | null) ?? null);
      setEditing((e) => ({ ...e, [section]: false }));
      if (!opts?.silent) toast.success("Saved", `We saved ${SECTION_LABEL[section]}.`);
      return true;
    } catch (err) {
      const message = friendlyError(err);
      setErrors((e) => ({ ...e, [section]: message }));
      toast.error("Couldn't save", message);
      return false;
    } finally {
      setSaving((s) => ({ ...s, [section]: false }));
    }
  }

  function startEdit(section: SectionKey) {
    setErrors((e) => ({ ...e, [section]: null }));
    setEditing((e) => ({ ...e, [section]: true }));
  }
  function cancelEdit(section: SectionKey) {
    setErrors((e) => ({ ...e, [section]: null }));
    setEditing((e) => ({ ...e, [section]: false }));
  }

  // ── section start helpers (populate drafts) ────────────────────────────────

  function startAccount() {
    startEdit("account");
  }
  function startPersonal() {
    const c = profile?.candidate ?? {};
    setDraftFullName(c.full_name ?? "");
    setDraftPhone(c.phone ?? "");
    setDraftLocation(c.location ?? "");
    setDraftLinkedin(c.linkedin ?? "");
    setDraftGithub(c.github ?? "");
    setDraftPortfolio(c.portfolio_url ?? "");
    setDraftTwitter(c.twitter ?? "");
    setDraftContactEmail(c.email ?? "");
    startEdit("personal");
  }
  function startCareer() {
    const n = profile?.narrative ?? {};
    const tr = profile?.target_roles ?? {};
    setDraftHeadline(n.headline ?? "");
    // "Professional summary" is shared with cv.summary (see onSave below) —
    // fall back to it so a summary written before this merge isn't hidden.
    setDraftExitStory(n.exit_story || cv?.summary || "");
    setDraftSuperpowers(n.superpowers ?? []);
    setDraftArchetypes((tr.archetypes ?? []).map((a) => ({ name: a.name ?? "", level: a.level ?? "", fit: a.fit ?? "primary" })));
    setDraftProofPoints((n.proof_points ?? []).map((p) => ({ name: p.name ?? "", url: p.url ?? "", hero_metric: p.hero_metric ?? "" })));
    startEdit("career");
  }
  function startMatching() {
    const d = matchingDraftFrom(profile ?? {});
    setDraftTitles(d.titles);
    setDraftAvoid(d.avoid);
    setDraftEligibleLocations(d.eligibleLocations);
    setDraftPrefLocations(d.prefLocations);
    setDraftRemoteOk(d.remoteOk);
    setDraftCompRange(d.compRange);
    setDraftCompMin(d.compMin);
    setDraftCurrency(d.currency);
    setDraftLocFlex(d.locFlex);
    // No time zone saved yet? Start from the one this device is set to.
    setDraftTimezone(d.timezone || detectTimeZone());
    setDraftVisaStatus(d.visaStatus);
    startEdit("matching");
  }
  function startExperience() {
    setDraftExperience((cv?.experience ?? []).map((e) => ({ ...e, highlights: [...e.highlights] })));
    startEdit("experience");
  }
  function startSkills() {
    setDraftSkills((cv?.skills ?? []).map((s) => ({ category: s.category, items: [...s.items] })));
    setDraftLanguages((cv?.languages ?? []).map((l) => ({ ...l })));
    startEdit("skills");
  }
  function startEducation() {
    setDraftEducation((cv?.education ?? []).map((e) => ({ ...e })));
    setDraftCertifications((cv?.certifications ?? []).map((x) => ({ ...x })));
    startEdit("education");
  }
  function startProjects() {
    setDraftProjects((cv?.projects ?? []).map((x) => ({ ...x, highlights: [...x.highlights] })));
    startEdit("projects");
  }

  // ── saving a section ───────────────────────────────────────────────────────

  function currentMatchingDraft(): MatchingDraft {
    return {
      titles: draftTitles,
      avoid: draftAvoid,
      prefLocations: draftPrefLocations,
      eligibleLocations: draftEligibleLocations,
      remoteOk: draftRemoteOk,
      compRange: draftCompRange,
      compMin: draftCompMin,
      currency: draftCurrency,
      locFlex: draftLocFlex,
      timezone: draftTimezone,
      visaStatus: draftVisaStatus,
    };
  }

  async function saveMatching(d: MatchingDraft, opts?: { silent?: boolean }): Promise<boolean> {
    const ok = await save("matching", matchingPatch(profileRef.current ?? {}, d), opts);
    // Offer to search again with what was just saved.
    if (ok) setFindAgain((f) => f ?? "saved");
    return ok;
  }

  /** Saves one section of the list from its draft; true when every part of it saved. */
  async function saveSection(id: string, opts?: { silent?: boolean }): Promise<boolean> {
    const base = () => profileRef.current ?? {};
    switch (id) {
      case "section-basics":
        // The account name and the profile's contact details are saved
        // separately, one after the other so neither answer overwrites the
        // other; only the second one announces "Saved".
        if (!(await save("account", { name: draftFullName }, { silent: true }))) return false;
        return save(
          "personal",
          {
            profile: {
              candidate: {
                ...(base().candidate ?? {}),
                full_name: draftFullName,
                phone: draftPhone,
                location: draftLocation,
                linkedin: draftLinkedin,
                github: draftGithub,
                portfolio_url: draftPortfolio,
                twitter: draftTwitter,
                email: draftContactEmail,
              },
            },
          },
          opts,
        );
      case "section-matching":
        return saveMatching(currentMatchingDraft(), opts);
      case "section-career":
        return save(
          "career",
          {
            profile: {
              narrative: {
                ...(base().narrative ?? {}),
                headline: draftHeadline,
                exit_story: draftExitStory,
                superpowers: draftSuperpowers,
                proof_points: draftProofPoints.map((pp) => ({ name: pp.name, url: pp.url || undefined, hero_metric: pp.hero_metric })),
              },
              // The job titles (target_roles.primary) are saved by "What you're
              // looking for" — keep them exactly as saved here.
              target_roles: { ...(base().target_roles ?? {}), archetypes: draftArchetypes },
            },
            // Same text as the profile's "Professional summary" — kept in sync
            // with cv.summary so it also satisfies the CV-readiness check.
            cv: { summary: draftExitStory },
          },
          opts,
        );
      case "section-experience":
        return save("experience", { cv: { experience: draftExperience } }, opts);
      case "section-skills":
        return save("skills", { cv: { skills: draftSkills, languages: draftLanguages } }, opts);
      case "section-education":
        return save("education", { cv: { education: draftEducation, certifications: draftCertifications } }, opts);
      case "section-projects":
        return save("projects", { cv: { projects: draftProjects } }, opts);
      default:
        return true;
    }
  }

  // ── unsaved changes ────────────────────────────────────────────────────────
  //
  // A section has unsaved changes when it's open for editing and its draft
  // differs from how it was when editing started. That starting point is
  // taken right after the section opens for editing (its first render in edit
  // mode), so filling in defaults like the time zone doesn't count as a change.

  const editingSection: Record<string, boolean> = {};
  for (const s of SECTION_NAV) editingSection[s.id] = SECTION_KEYS[s.id].some((k) => editing[k] ?? false);

  function draftSnapshot(id: string): string {
    switch (id) {
      case "section-basics":
        return JSON.stringify([draftFullName, draftPhone, draftLocation, draftLinkedin, draftGithub, draftPortfolio, draftTwitter, draftContactEmail]);
      case "section-matching":
        return JSON.stringify(currentMatchingDraft());
      case "section-career":
        return JSON.stringify([draftHeadline, draftExitStory, draftSuperpowers, draftArchetypes, draftProofPoints]);
      case "section-experience":
        return JSON.stringify(draftExperience);
      case "section-skills":
        return JSON.stringify([draftSkills, draftLanguages]);
      case "section-education":
        return JSON.stringify([draftEducation, draftCertifications]);
      case "section-projects":
        return JSON.stringify(draftProjects);
      default:
        return "";
    }
  }

  React.useLayoutEffect(() => {
    for (const s of SECTION_NAV) {
      if (!editingSection[s.id]) delete baselineRef.current[s.id];
      else if (baselineRef.current[s.id] === undefined) baselineRef.current[s.id] = draftSnapshot(s.id);
    }
  });

  const unsavedIds = SECTION_NAV.map((s) => s.id).filter((id) => {
    const start = baselineRef.current[id];
    return editingSection[id] && start !== undefined && start !== draftSnapshot(id);
  });
  const hasUnsaved = unsavedIds.length > 0;

  // While anything is unsaved, leaving asks first.
  React.useEffect(() => {
    if (!hasUnsaved) return;
    // Closing the tab, reloading, or going to another site: the browser asks.
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = ""; // older browsers need this to ask
    }
    // A link to another page of the app (header, tab bar, user menu): we ask,
    // in our own words. This runs before Next's <Link> click handler, which
    // then leaves the click alone because it was already defaultPrevented.
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Other sites are covered by beforeunload; "#…" links stay on this page.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      leaveChosenRef.current = false;
      setLeaveHref(`${url.pathname}${url.search}${url.hash}`);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [hasUnsaved]);

  /** Goes to another page of the app — after asking, if anything isn't saved. */
  function leaveTo(href: string) {
    if (hasUnsaved) {
      leaveChosenRef.current = false;
      setLeaveHref(href);
    } else {
      router.push(href);
    }
  }

  /** "Save them": saves every section with unsaved changes, then goes on. */
  async function saveUnsavedAndLeave() {
    const href = leaveHref;
    if (!href) return;
    setLeaveSaving(true);
    // One at a time, so each save builds on the one before.
    for (const id of unsavedIds) {
      if (!(await saveSection(id, { silent: true }))) {
        // Stay, and open the section that didn't save; it shows the error.
        setLeaveSaving(false);
        setLeaveHref(null);
        revealSectionRef.current = true;
        setActiveSection(id);
        setMobileView("section");
        return;
      }
    }
    toast.success("Saved", "We saved your changes.");
    setLeaveSaving(false);
    setLeaveHref(null);
    leavingRef.current = true;
    router.push(href);
  }

  // ── renders ────────────────────────────────────────────────────────────────

  const checklist = React.useMemo(
    () => buildChecklist(profile ?? {}, cv ?? {}, user?.resumeKey ?? null),
    [profile, cv, user?.resumeKey],
  );
  const sectionStates = React.useMemo(() => buildSectionStates(checklist, cv ?? {}), [checklist, cv]);
  const completedCount = checklist.filter((i) => i.done).length;
  const completionPct = Math.round((completedCount / checklist.length) * 100);

  const firstName = user?.name?.trim().split(" ")[0];
  const header = (
    <PageHeader title="My profile" description={firstName ? `Hi ${firstName}. ${PAGE_DESCRIPTION}` : PAGE_DESCRIPTION} />
  );

  if (loading)
    return (
      <Page width="wide">
        {header}
        <VStack gap={4} role="status">
          <span className="sr-only">Loading your profile…</span>
          <Skeleton height={140} />
          <Skeleton height={96} index={1} />
          <Skeleton height={360} index={2} />
        </VStack>
      </Page>
    );
  if (pageError)
    return (
      <Page width="wide">
        {header}
        <Banner
          status="error"
          title="We couldn't load your profile"
          description={pageError}
          endContent={<Button label="Try again" onClick={() => void load()} />}
        />
      </Page>
    );

  const p = profile ?? {};
  const c = cv ?? {};
  const isEditing = (s: SectionKey) => editing[s] ?? false;
  const isSaving = (s: SectionKey) => saving[s] ?? false;
  const sectionError = (s: SectionKey) => errors[s] ?? null;

  /** Sets one field of one entry in a draft list. */
  function patchAt<T>(set: React.Dispatch<React.SetStateAction<T[]>>, i: number, patch: Partial<T>) {
    set((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function removeAt<T>(set: React.Dispatch<React.SetStateAction<T[]>>, i: number) {
    set((d) => d.filter((_, j) => j !== i));
  }

  // ── About you ──────────────────────────────────────────────────────────────
  const basicsEditing = isEditing("account") || isEditing("personal");
  const hasMoreLinks = isFilled(p.candidate?.github) || isFilled(p.candidate?.twitter);
  const basics = (
    <SectionCard
      id="section-basics"
      title="About you"
      description="Your name and how employers can reach you."
      editing={basicsEditing}
      saving={isSaving("account") || isSaving("personal")}
      error={sectionError("account") || sectionError("personal")}
      onEdit={() => {
        startAccount();
        startPersonal();
      }}
      onSave={() => void saveSection("section-basics")}
      onCancel={() => {
        cancelEdit("account");
        cancelEdit("personal");
      }}
    >
      <VStack gap={5}>
        <HStack gap={4} vAlign="center" className="min-w-0">
          <Avatar
            name={user?.name || user?.email || "You"}
            src={user?.image ?? undefined}
            size="lg"
            tooltip={false}
          />
          <VStack gap={0.5} className="min-w-0">
            <Text color="secondary">Email you sign in with</Text>
            <span className="[overflow-wrap:anywhere]">
              <Text weight="semibold">{user?.email ?? "Not added yet"}</Text>
            </span>
          </VStack>
        </HStack>

        {isEditing("personal") ? (
          <VStack gap={4}>
            <FieldGrid>
              <TextField label="Full name" value={draftFullName} onChange={setDraftFullName} placeholder="Your full name" autoComplete="name" />
              <TextField label="Phone number" type="tel" value={draftPhone} onChange={setDraftPhone} placeholder="Your phone number" autoComplete="tel" />
              <TextField
                label="Where you live"
                hint="City and country. We put it on résumés we make for you — it doesn't limit your job search."
                value={draftLocation}
                onChange={setDraftLocation}
                placeholder="Lagos, Nigeria"
              />
              {/* Distinct from the read-only sign-in email above: this is the
                  address pulled off the résumé and printed on generated CVs
                  (src/lib/candidate-loader.ts). */}
              <TextField
                label="Email on your résumé"
                hint="Shown on résumés we make for you. It can be different from the email you sign in with."
                type="email"
                value={draftContactEmail}
                onChange={setDraftContactEmail}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <TextField label="LinkedIn (optional)" type="url" value={draftLinkedin} onChange={setDraftLinkedin} placeholder="https://linkedin.com/in/your-name" />
              <TextField label="Website or portfolio (optional)" type="url" value={draftPortfolio} onChange={setDraftPortfolio} placeholder="https://your-website.com" />
            </FieldGrid>
            <MoreDetails label="Other links (optional)">
              <FieldGrid>
                <TextField label="GitHub (for software developers)" type="url" value={draftGithub} onChange={setDraftGithub} placeholder="https://github.com/your-name" />
                <TextField label="X (formerly Twitter)" type="url" value={draftTwitter} onChange={setDraftTwitter} placeholder="https://x.com/your-name" />
              </FieldGrid>
            </MoreDetails>
          </VStack>
        ) : (
          <VStack gap={4}>
            <InfoList>
              <InfoItem label="Full name" value={p.candidate?.full_name} />
              <InfoItem label="Phone number" value={p.candidate?.phone} />
              <InfoItem label="Where you live" value={p.candidate?.location} />
              <InfoItem label="Email on your résumé" value={p.candidate?.email} />
              <InfoItem label="LinkedIn" value={p.candidate?.linkedin} />
              <InfoItem label="Website or portfolio" value={p.candidate?.portfolio_url} />
            </InfoList>
            {/* Nothing behind the door yet? Then no door — Edit shows where to add them. */}
            {hasMoreLinks ? (
              <MoreDetails label="Other links (optional)">
                <InfoList>
                  <InfoItem label="GitHub (for software developers)" value={p.candidate?.github} />
                  <InfoItem label="X (formerly Twitter)" value={p.candidate?.twitter} />
                </InfoList>
              </MoreDetails>
            ) : null}
          </VStack>
        )}
      </VStack>
    </SectionCard>
  );

  // ── What you're looking for ────────────────────────────────────────────────
  // The one place that controls job searches. Job titles used to be asked for
  // twice ("Career goals" and "Job search settings"), remote twice, and pay
  // had its own section; they're all here now, saved together in one PATCH.
  const matchingEditing = isEditing("matching");
  const savedTitles = mergedJobTitles(p);
  const savedAvoid = [...new Set([...(p.matching?.exclude_titles ?? []), ...(p.matching?.seniority_exclusions ?? [])])];
  const titlesNeedSaving = jobTitlesNeedSaving(p);
  const searchReady = isSearchReady(p.matching);
  // The dashboard starts a new search itself when it sees `?find=1`.
  const findAgainBanner = findAgain ? (
    <Banner
      status="info"
      title="Search again with these changes?"
      description="Add more cities, or allow remote jobs, then search again."
      endContent={<Button variant="primary" size="lg" label="Find new jobs" onClick={() => leaveTo("/?find=1")} />}
      isDismissable={findAgain === "saved"}
      onDismiss={() => setFindAgain(null)}
    />
  ) : null;
  const matching = (
    <SectionCard
      id="section-matching"
      title="What you're looking for"
      description="This is what we use to search for jobs for you."
      editing={matchingEditing}
      saving={isSaving("matching")}
      error={sectionError("matching")}
      onEdit={startMatching}
      onSave={() => void saveMatching(currentMatchingDraft())}
      onCancel={() => cancelEdit("matching")}
    >
      {matchingEditing ? (
        <VStack gap={5}>
          <TagField
            label="Jobs you want"
            hint="Start typing, then pick from the list or press Add. Add as many as you like."
            values={draftTitles}
            onChange={setDraftTitles}
            placeholder="Operations Manager"
            autocomplete="job-titles"
          />
          <TagField
            label="Leave out jobs with these words (optional)"
            hint="We'll skip jobs with any of these words in the title, for example Senior or Sales. Type a word, then press Add."
            values={draftAvoid}
            onChange={setDraftAvoid}
            placeholder="Sales"
            autocomplete="job-titles"
          />
          <TagField
            label="Places you'd like to work"
            hint="Cities, regions or countries. Start typing, then pick from the list or press Add."
            values={draftPrefLocations}
            onChange={setDraftPrefLocations}
            placeholder="Lagos, Nigeria"
            autocomplete="locations"
          />
          <ChoiceList
            label="Include remote jobs?"
            value={draftRemoteOk ? "yes" : "no"}
            onChange={(v) => setDraftRemoteOk(v === "yes")}
          >
            <RadioListItem value="yes" label="Yes" />
            <RadioListItem value="no" label="No, only jobs in the places above" />
          </ChoiceList>
          <MoreDetails label="Pay and other details (optional)" isOpen={payOpen} onOpenChange={setPayOpen}>
            <VStack gap={4}>
              <FieldGrid>
                <TextField label="Pay you're aiming for" hint="A yearly range is fine." value={draftCompRange} onChange={setDraftCompRange} placeholder="$80,000 – $95,000" />
                <TextField label="Lowest pay you'd accept" value={draftCompMin} onChange={setDraftCompMin} placeholder="$75,000" />
                <CurrencyField label="Currency" value={draftCurrency} onChange={setDraftCurrency} />
                <TextField
                  label="Work permit or visa"
                  hint="For example: citizen, permanent resident, or needs sponsorship."
                  value={draftVisaStatus}
                  onChange={setDraftVisaStatus}
                  placeholder="Permanent resident"
                />
                <TimeZoneField label="Time zone" value={draftTimezone} onChange={setDraftTimezone} />
              </FieldGrid>
              <TagField
                label="Countries you're allowed to work in"
                hint="Helps with remote jobs that are only open to certain countries. Start typing, then pick from the list or press Add. Leave it empty if you're not sure."
                values={draftEligibleLocations}
                onChange={setDraftEligibleLocations}
                placeholder="Canada"
                autocomplete="locations"
              />
              <TextAreaField
                label="Anything else about how you can work"
                hint="For example: hybrid only, or happy to travel now and then."
                rows={3}
                value={draftLocFlex}
                onChange={setDraftLocFlex}
                placeholder="Hybrid suits me best; I can travel now and then"
              />
            </VStack>
          </MoreDetails>
        </VStack>
      ) : (
        <VStack gap={5}>
          {findAgainBanner}
          {titlesNeedSaving ? (
            <Banner
              status="warning"
              title="Save this list so we can use it"
              description="We use these jobs to search for you and to check how well each one fits you."
              endContent={
                <Button
                  // The "Find new jobs" button above is the main action when it's showing.
                  variant={findAgain ? "secondary" : "primary"}
                  size="lg"
                  label="Save this list"
                  isLoading={isSaving("matching")}
                  onClick={() => void saveMatching(matchingDraftFrom(profileRef.current ?? p))}
                />
              }
            />
          ) : !searchReady ? (
            <Banner
              status="warning"
              title="We can't search for jobs yet"
              description="Add at least one job you want, and a place to work or choose to include remote jobs."
            />
          ) : null}
          <InfoList columns="single">
            <TagItem label="Jobs you want" values={savedTitles} />
            <TagItem label="Leave out jobs with these words" values={savedAvoid} />
            <TagItem label="Places you'd like to work" values={p.matching?.preferred_locations ?? []} />
            <MetadataListItem label="Include remote jobs?">
              <Text>{(p.matching?.remote_ok ?? true) ? "Yes" : "No, only jobs in the places above"}</Text>
            </MetadataListItem>
          </InfoList>
          {savedTitles.length > 0 && !titlesNeedSaving ? (
            <Text color="secondary" textWrap="pretty">
              We may have filled these in from your résumé. Check them and add anything we missed.
            </Text>
          ) : null}
          <MoreDetails label="Pay and other details (optional)" isOpen={payOpen} onOpenChange={setPayOpen}>
            <InfoList>
              <InfoItem label="Pay you're aiming for" value={p.compensation?.target_range} />
              <InfoItem label="Lowest pay you'd accept" value={p.compensation?.minimum} />
              <InfoItem label="Currency" value={currencyLabel(p.compensation?.currency)} />
              <InfoItem label="Work permit or visa" value={p.location?.visa_status} />
              <InfoItem label="Time zone" value={timeZoneLabel(p.location?.timezone)} />
              <TagItem label="Countries you're allowed to work in" values={p.matching?.eligible_locations ?? []} />
              <InfoItem
                label="Anything else about how you can work"
                value={[p.compensation?.location_flexibility, p.location?.onsite_availability].filter(Boolean).join(" · ")}
              />
            </InfoList>
          </MoreDetails>
        </VStack>
      )}
    </SectionCard>
  );

  // ── Your story ─────────────────────────────────────────────────────────────
  const careerEditing = isEditing("career");
  const archetypes = careerEditing ? draftArchetypes : (p.target_roles?.archetypes ?? []);
  const proofPoints: ProofPoint[] = careerEditing
    ? draftProofPoints
    : (p.narrative?.proof_points ?? []).map((pp) => ({ name: pp.name, url: pp.url ?? "", hero_metric: pp.hero_metric }));
  const career = (
    <SectionCard
      id="section-career"
      title="Your story"
      description="How you'd describe yourself to an employer, in your own words."
      editing={careerEditing}
      saving={isSaving("career")}
      error={sectionError("career")}
      onEdit={startCareer}
      onSave={() => void saveSection("section-career")}
      onCancel={() => cancelEdit("career")}
    >
      <VStack gap={6}>
        {careerEditing ? (
          <VStack gap={4}>
            <TextField
              label="One line about you"
              hint="Sums up who you are at work, like a headline."
              value={draftHeadline}
              onChange={setDraftHeadline}
              placeholder="Operations Manager with 10 years in logistics"
            />
            <TextAreaField
              label="Summary"
              hint="A few sentences about your background and what you want next."
              rows={5}
              value={draftExitStory}
              onChange={setDraftExitStory}
              placeholder="I've run warehouse teams for a decade and now want to move into supply-chain planning."
            />
            <TagField
              label="Your strengths"
              hint="Type a strength, then press Add."
              values={draftSuperpowers}
              onChange={setDraftSuperpowers}
              placeholder="Team leadership"
            />
          </VStack>
        ) : (
          <InfoList columns="single">
            <InfoItem label="One line about you" value={p.narrative?.headline} />
            <InfoItem label="Summary" value={p.narrative?.exit_story || c.summary} multiline />
            <TagItem label="Your strengths" values={p.narrative?.superpowers ?? []} />
          </InfoList>
        )}

        <EntryGroup
          title="Types of roles"
          description="The broad kinds of work you'd do, how senior, and how much you want each. We use these when we check how well a job fits you."
          editing={careerEditing}
          isEmpty={archetypes.length === 0}
          addLabel="Add a type of role"
          onAdd={() => setDraftArchetypes((d) => [...d, { name: "", level: "", fit: "primary" }])}
        >
          {archetypes.map((a, i) => (
            <EntryBlock key={i} editing={careerEditing} removeLabel="Remove this type of role" onRemove={() => removeAt(setDraftArchetypes, i)}>
              {careerEditing ? (
                <VStack gap={4}>
                  <FieldGrid>
                    <TextField label="Kind of role" value={a.name} onChange={(v) => patchAt(setDraftArchetypes, i, { name: v })} placeholder="Operations" />
                    <TextField
                      label="Seniority"
                      hint="How senior a role you're after."
                      value={a.level}
                      onChange={(v) => patchAt(setDraftArchetypes, i, { level: v })}
                      placeholder="Senior"
                    />
                  </FieldGrid>
                  <ChoiceList
                    label="How much you want it"
                    value={a.fit}
                    onChange={(v) => patchAt(setDraftArchetypes, i, { fit: v })}
                  >
                    {fitOptions(a.fit).map((o) => (
                      <RadioListItem key={o.value} value={o.value} label={o.label} />
                    ))}
                  </ChoiceList>
                </VStack>
              ) : (
                <VStack gap={0.5}>
                  <Text weight="semibold">{a.name || "Name not added yet"}</Text>
                  <Text color="secondary">{joinParts([a.level ? `Seniority: ${a.level}` : undefined, fitLabel(a.fit)])}</Text>
                </VStack>
              )}
            </EntryBlock>
          ))}
        </EntryGroup>

        <EntryGroup
          title="Achievements"
          description="Results you're proud of, with numbers if you have them."
          editing={careerEditing}
          isEmpty={proofPoints.length === 0}
          addLabel="Add an achievement"
          onAdd={() => setDraftProofPoints((d) => [...d, { name: "", url: "", hero_metric: "" }])}
        >
          {proofPoints.map((pp, i) => (
            <EntryBlock key={i} editing={careerEditing} removeLabel="Remove achievement" onRemove={() => removeAt(setDraftProofPoints, i)}>
              {careerEditing ? (
                <FieldGrid>
                  <TextField label="What you did" value={pp.name} onChange={(v) => patchAt(setDraftProofPoints, i, { name: v })} placeholder="Opened a second warehouse" />
                  <TextField label="Result" value={pp.hero_metric} onChange={(v) => patchAt(setDraftProofPoints, i, { hero_metric: v })} placeholder="Cut delivery times by 30%" />
                  <TextField label="Link (optional)" type="url" value={pp.url} onChange={(v) => patchAt(setDraftProofPoints, i, { url: v })} placeholder="https://…" />
                </FieldGrid>
              ) : (
                <VStack gap={0.5}>
                  <Text weight="semibold">{pp.name || "Not added yet"}</Text>
                  {pp.hero_metric ? <Text color="secondary">{pp.hero_metric}</Text> : null}
                  {pp.url ? <ValueText value={pp.url} /> : null}
                </VStack>
              )}
            </EntryBlock>
          ))}
        </EntryGroup>
      </VStack>
    </SectionCard>
  );

  // ── Work history ───────────────────────────────────────────────────────────
  const experienceEditing = isEditing("experience");
  const experience = experienceEditing ? draftExperience : (c.experience ?? []);
  const workHistory = (
    <SectionCard
      id="section-experience"
      title="Work history"
      description="The jobs you've had, most recent first."
      editing={experienceEditing}
      saving={isSaving("experience")}
      error={sectionError("experience")}
      onEdit={startExperience}
      onSave={() => void saveSection("section-experience")}
      onCancel={() => cancelEdit("experience")}
    >
      <EntryGroup
        editing={experienceEditing}
        isEmpty={experience.length === 0}
        addLabel="Add a job"
        onAdd={() => setDraftExperience((d) => [...d, { company: "", role: "", location: "", period: "", highlights: [] }])}
      >
        {experience.map((exp, i) => (
          <EntryBlock key={i} editing={experienceEditing} removeLabel="Remove job" onRemove={() => removeAt(setDraftExperience, i)}>
            {experienceEditing ? (
              <VStack gap={4}>
                <FieldGrid>
                  <TextField label="Job title" value={exp.role} onChange={(v) => patchAt(setDraftExperience, i, { role: v })} placeholder="Operations Manager" />
                  <TextField label="Employer" value={exp.company} onChange={(v) => patchAt(setDraftExperience, i, { company: v })} placeholder="Northwind Logistics" />
                  <TextField label="Where" value={exp.location} onChange={(v) => patchAt(setDraftExperience, i, { location: v })} placeholder="Manchester, UK" />
                  <TextField label="When" value={exp.period} onChange={(v) => patchAt(setDraftExperience, i, { period: v })} placeholder="Jan 2022 – now" />
                </FieldGrid>
                <LinesField
                  label="What you did"
                  values={exp.highlights}
                  onChange={(v) => patchAt(setDraftExperience, i, { highlights: v })}
                  placeholder={"Led a team of 12\nCut shipping costs by 15%"}
                />
              </VStack>
            ) : (
              <VStack gap={2}>
                <VStack gap={0.5}>
                  <HStack gap={2} hAlign="between" wrap="wrap">
                    <Text weight="semibold">{exp.role || "Job title not added yet"}</Text>
                    {exp.period ? <Text color="secondary">{exp.period}</Text> : null}
                  </HStack>
                  {exp.company || exp.location ? <Text color="secondary">{joinParts([exp.company, exp.location])}</Text> : null}
                </VStack>
                <BulletList items={exp.highlights} />
              </VStack>
            )}
          </EntryBlock>
        ))}
      </EntryGroup>
    </SectionCard>
  );

  // ── Skills & languages ─────────────────────────────────────────────────────
  const skillsEditing = isEditing("skills");
  const skillGroups = skillsEditing ? draftSkills : (c.skills ?? []);
  const languages = skillsEditing ? draftLanguages : (c.languages ?? []);
  const skills = (
    <SectionCard
      id="section-skills"
      title="Skills & languages"
      description="What you're good at and the languages you speak."
      editing={skillsEditing}
      saving={isSaving("skills")}
      error={sectionError("skills")}
      onEdit={startSkills}
      onSave={() => void saveSection("section-skills")}
      onCancel={() => cancelEdit("skills")}
    >
      <VStack gap={6}>
        <EntryGroup
          title="Skills"
          description="Group them however makes sense to you."
          editing={skillsEditing}
          isEmpty={skillGroups.length === 0}
          addLabel="Add a group of skills"
          onAdd={() => setDraftSkills((d) => [...d, { category: "", items: [] }])}
        >
          {skillGroups.map((sg, i) => (
            <EntryBlock key={i} editing={skillsEditing} removeLabel="Remove group" onRemove={() => removeAt(setDraftSkills, i)}>
              {skillsEditing ? (
                <VStack gap={4}>
                  <TextField label="Name of this group" value={sg.category} onChange={(v) => patchAt(setDraftSkills, i, { category: v })} placeholder="Software" />
                  <TagField
                    label="Skills"
                    hint="Type a skill, then press Add."
                    values={sg.items}
                    onChange={(v) => patchAt(setDraftSkills, i, { items: v })}
                    placeholder="Excel"
                  />
                </VStack>
              ) : (
                <VStack gap={2}>
                  <Text weight="semibold">{sg.category || "Skills"}</Text>
                  {sg.items.length > 0 ? <Text color="secondary">{sg.items.join(", ")}</Text> : <Text color="secondary">Not added yet</Text>}
                </VStack>
              )}
            </EntryBlock>
          ))}
        </EntryGroup>

        {/* Languages — grouped here rather than given their own section. */}
        <EntryGroup
          title="Languages"
          editing={skillsEditing}
          isEmpty={languages.length === 0}
          addLabel="Add a language"
          onAdd={() => setDraftLanguages((d) => [...d, { language: "", proficiency: "" }])}
        >
          {languages.map((lg, i) => (
            <EntryBlock key={i} editing={skillsEditing} removeLabel="Remove language" onRemove={() => removeAt(setDraftLanguages, i)}>
              {skillsEditing ? (
                <FieldGrid>
                  <TextField label="Language" value={lg.language} onChange={(v) => patchAt(setDraftLanguages, i, { language: v })} placeholder="Spanish" />
                  <TextField label="How well you speak it" value={lg.proficiency} onChange={(v) => patchAt(setDraftLanguages, i, { proficiency: v })} placeholder="Fluent" />
                </FieldGrid>
              ) : (
                <Text>
                  <Text weight="semibold">{lg.language || "Language not added yet"}</Text>
                  {lg.proficiency ? <Text color="secondary">{` · ${lg.proficiency}`}</Text> : null}
                </Text>
              )}
            </EntryBlock>
          ))}
        </EntryGroup>
      </VStack>
    </SectionCard>
  );

  // ── Education ──────────────────────────────────────────────────────────────
  const educationEditing = isEditing("education");
  const educationList = educationEditing ? draftEducation : (c.education ?? []);
  const certifications = educationEditing ? draftCertifications : (c.certifications ?? []);
  const education = (
    <SectionCard
      id="section-education"
      title="Education"
      description="Schools, degrees and certificates."
      editing={educationEditing}
      saving={isSaving("education")}
      error={sectionError("education")}
      onEdit={startEducation}
      onSave={() => void saveSection("section-education")}
      onCancel={() => cancelEdit("education")}
    >
      <VStack gap={6}>
        <EntryGroup
          title="Schools and degrees"
          editing={educationEditing}
          isEmpty={educationList.length === 0}
          addLabel="Add a school"
          onAdd={() => setDraftEducation((d) => [...d, { institution: "", degree: "", field: "", period: "", details: "" }])}
        >
          {educationList.map((ed, i) => (
            <EntryBlock key={i} editing={educationEditing} removeLabel="Remove school" onRemove={() => removeAt(setDraftEducation, i)}>
              {educationEditing ? (
                <VStack gap={4}>
                  <FieldGrid>
                    <TextField label="School" value={ed.institution} onChange={(v) => patchAt(setDraftEducation, i, { institution: v })} placeholder="University of Nairobi" />
                    <TextField label="Degree or qualification" value={ed.degree} onChange={(v) => patchAt(setDraftEducation, i, { degree: v })} placeholder="Bachelor of Commerce" />
                    <TextField label="Subject" value={ed.field} onChange={(v) => patchAt(setDraftEducation, i, { field: v })} placeholder="Accounting" />
                    <TextField label="When" value={ed.period} onChange={(v) => patchAt(setDraftEducation, i, { period: v })} placeholder="2014 – 2018" />
                  </FieldGrid>
                  <TextAreaField
                    label="Details (optional)"
                    hint="Grades, honours or courses worth mentioning."
                    rows={2}
                    value={ed.details}
                    onChange={(v) => patchAt(setDraftEducation, i, { details: v })}
                  />
                </VStack>
              ) : (
                <VStack gap={0.5}>
                  <HStack gap={2} hAlign="between" wrap="wrap">
                    <Text weight="semibold">{ed.institution || "School not added yet"}</Text>
                    {ed.period ? <Text color="secondary">{ed.period}</Text> : null}
                  </HStack>
                  {ed.degree || ed.field ? <Text color="secondary">{joinParts([ed.degree, ed.field], ", ")}</Text> : null}
                  {ed.details ? <Text color="secondary">{ed.details}</Text> : null}
                </VStack>
              )}
            </EntryBlock>
          ))}
        </EntryGroup>

        <EntryGroup
          title="Certificates"
          editing={educationEditing}
          isEmpty={certifications.length === 0}
          addLabel="Add a certificate"
          onAdd={() => setDraftCertifications((d) => [...d, { name: "", issuer: "", year: "" }])}
        >
          {certifications.map((ct, i) => (
            <EntryBlock key={i} editing={educationEditing} removeLabel="Remove certificate" onRemove={() => removeAt(setDraftCertifications, i)}>
              {educationEditing ? (
                <FieldGrid>
                  <TextField label="Certificate" value={ct.name} onChange={(v) => patchAt(setDraftCertifications, i, { name: v })} placeholder="Project Management Professional" />
                  <TextField label="Given by" value={ct.issuer} onChange={(v) => patchAt(setDraftCertifications, i, { issuer: v })} placeholder="PMI" />
                  <TextField label="Year" value={ct.year} onChange={(v) => patchAt(setDraftCertifications, i, { year: v })} placeholder="2021" inputMode="numeric" />
                </FieldGrid>
              ) : (
                <VStack gap={0.5}>
                  <Text weight="semibold">{ct.name || "Certificate name not added yet"}</Text>
                  {ct.issuer || ct.year ? <Text color="secondary">{joinParts([ct.issuer, ct.year])}</Text> : null}
                </VStack>
              )}
            </EntryBlock>
          ))}
        </EntryGroup>
      </VStack>
    </SectionCard>
  );

  // ── Projects ───────────────────────────────────────────────────────────────
  const projectsEditing = isEditing("projects");
  const projectList = projectsEditing ? draftProjects : (c.projects ?? []);
  const projects = (
    <SectionCard
      id="section-projects"
      title="Projects"
      description="Things you've built, run or led that you're proud of."
      editing={projectsEditing}
      saving={isSaving("projects")}
      error={sectionError("projects")}
      onEdit={startProjects}
      onSave={() => void saveSection("section-projects")}
      onCancel={() => cancelEdit("projects")}
    >
      <EntryGroup
        editing={projectsEditing}
        isEmpty={projectList.length === 0}
        addLabel="Add a project"
        onAdd={() => setDraftProjects((d) => [...d, { name: "", description: "", url: "", highlights: [] }])}
      >
        {projectList.map((pr, i) => (
          <EntryBlock key={i} editing={projectsEditing} removeLabel="Remove project" onRemove={() => removeAt(setDraftProjects, i)}>
            {projectsEditing ? (
              <VStack gap={4}>
                <FieldGrid>
                  <TextField label="Project name" value={pr.name} onChange={(v) => patchAt(setDraftProjects, i, { name: v })} placeholder="Community food bank app" />
                  <TextField label="Link (optional)" type="url" value={pr.url} onChange={(v) => patchAt(setDraftProjects, i, { url: v })} placeholder="https://…" />
                </FieldGrid>
                <TextAreaField
                  label="Short description"
                  rows={2}
                  value={pr.description}
                  onChange={(v) => patchAt(setDraftProjects, i, { description: v })}
                  placeholder="An app that helps volunteers plan weekly food deliveries."
                />
                <LinesField
                  label="What stands out"
                  values={pr.highlights}
                  onChange={(v) => patchAt(setDraftProjects, i, { highlights: v })}
                  placeholder={"Used by 40 volunteers every week\nBuilt with a team of three"}
                />
              </VStack>
            ) : (
              <VStack gap={2}>
                <VStack gap={0.5}>
                  <Text weight="semibold">{pr.name || "Project name not added yet"}</Text>
                  {pr.description ? <Text color="secondary">{pr.description}</Text> : null}
                  {pr.url ? <ValueText value={pr.url} /> : null}
                </VStack>
                <BulletList items={pr.highlights} />
              </VStack>
            )}
          </EntryBlock>
        ))}
      </EntryGroup>
    </SectionCard>
  );

  const sectionContent: Record<string, React.ReactNode> = {
    "section-basics": basics,
    "section-matching": matching,
    "section-career": career,
    "section-experience": workHistory,
    "section-skills": skills,
    "section-education": education,
    "section-projects": projects,
  };

  // A section with unsaved changes says so in the list, instead of its status.
  const navStates: Record<string, SectionMarker> = { ...sectionStates };
  for (const id of unsavedIds) navStates[id] = "unsaved";

  return (
    <Page width="wide">
      {header}

      <ResumeCard
        // Phones: hidden while a section is open, so the section starts at the top.
        className={mobileView === "section" ? "max-md:hidden" : undefined}
        resumeKey={user?.resumeKey ?? null}
        resumeUpdatedAt={user?.resumeUpdatedAt ?? null}
        onUploaded={(key, updatedAt) => setUser((u) => (u ? { ...u, resumeKey: key || null, resumeUpdatedAt: updatedAt || null } : u))}
        onExtracted={(newProfile, newCv) => {
          setProfile(newProfile);
          setCv(newCv);
        }}
      />

      {completionPct < 100 ? <CompletenessCard checklist={checklist} onGo={goToSection} /> : null}

      <div ref={sectionsRef} className="grid scroll-mt-24 gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
        <SectionList
          active={activeSection}
          states={navStates}
          onSelect={goToSection}
          className={mobileView === "section" ? "hidden md:block" : undefined}
        />
        <div className={mobileView === "list" ? "hidden min-w-0 md:block" : "min-w-0"}>
          <VStack gap={4}>
            <div ref={backRef} className="md:hidden">
              <Button label="All sections" icon={<Icon icon={ArrowLeft} />} onClick={showAllSections} />
            </div>
            {sectionContent[activeSection]}
          </VStack>
        </div>
      </div>

      <AlertDialog
        isOpen={leaveHref !== null}
        onOpenChange={(open) => {
          if (open || leaveSaving) return;
          const href = leaveHref;
          const leave = leaveChosenRef.current;
          leaveChosenRef.current = false;
          setLeaveHref(null);
          if (leave && href) {
            leavingRef.current = true;
            router.push(href);
          }
        }}
        // "Leave without saving" (the dialog's cancel button) and Escape close
        // it the same way. Only a press on that button means leave; Escape
        // keeps the person here with their changes.
        onClickCapture={(e) => {
          const button = e.target instanceof Element ? e.target.closest("button") : null;
          leaveChosenRef.current = button?.textContent?.trim() === LEAVE_LABEL;
        }}
        title="You have changes you haven't saved"
        description={
          unsavedIds.length > 0
            ? `Your changes to ${sectionNames(unsavedIds)} aren't saved yet. If you leave now, you'll lose them.`
            : "Some of your changes aren't saved yet. If you leave now, you'll lose them."
        }
        cancelLabel={LEAVE_LABEL}
        actionLabel="Save them"
        actionVariant="primary"
        isActionLoading={leaveSaving}
        onAction={() => void saveUnsavedAndLeave()}
      />
    </Page>
  );
}

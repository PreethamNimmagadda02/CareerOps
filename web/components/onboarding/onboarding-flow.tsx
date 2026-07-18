"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  MapPin,
  PartyPopper,
  Pencil,
  Radar,
  RotateCw,
  Search,
  Sparkles,
  Tags,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Confetti } from "@/components/ui/confetti";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { usePipeline } from "@/components/pipeline-provider";
import { Spinner } from "@/components/ui/spinner";
import { parseScanTelemetry } from "@/lib/scan-telemetry";
import { deriveMatchingDefaults } from "@/lib/matching-defaults";
import type { OnboardingState } from "@/lib/types";
import type { PipelineCommand } from "@/lib/pipeline";

type Phase = "profile" | "scan" | "reveal";
type ResumeState = "idle" | "uploading" | "extracting" | "done" | "error";
type ScanStage = "idle" | "scanning" | "scoring" | "done";

/** The real, static scoring rubric — shown as an authority signal, not a fabricated benchmark. */
const DIMENSIONS = [
  { label: "Technical fit", weight: 35 },
  { label: "Level match", weight: 20 },
  { label: "Location / remote", weight: 15 },
  { label: "Growth", weight: 15 },
  { label: "Domain", weight: 15 },
];

/** The four onboarding steps shown in the progress rail. */
const RAIL_STEPS: { name: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { name: "Profile", icon: UserRound },
  { name: "Find", icon: Radar },
  { name: "Score", icon: Sparkles },
  { name: "Matches", icon: PartyPopper },
];

function phaseFor(o: OnboardingState): Phase {
  if (!o.profile.done || !o.keywords.done) return "profile";
  if (!o.scan.done || !o.evaluate.done) return "scan";
  return "reveal";
}

/** Ease-out count-up to a fixed target. The reveal's dopamine beat. */
function useCountUp(target: number, active: boolean, duration = 1000): number {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return value;
}

/** A short, one-time haptic tap on supporting devices — silent no-op elsewhere. */
function haptic(pattern: number | number[] = 18) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* unsupported — ignore */
    }
  }
}

/** A role discovered by the scan — the only shape the live feed needs. */
type FoundRole = { num: string; company: string; role: string };

/**
 * Reconcile the positive keyword filters (which drive the scan's title match)
 * with the candidate's target roles: add titles that were added, remove titles
 * that were removed. Diffing against the previous titles means keywords the
 * user added by hand are left untouched. Pass `oldTitles = []` to seed.
 */
async function syncKeywordsToTitles(oldTitles: string[], newTitles: string[]): Promise<void> {
  const norm = (s: string) => s.trim().toLowerCase();
  const oldSet = new Set(oldTitles.map(norm).filter(Boolean));
  const newSet = new Set(newTitles.map(norm).filter(Boolean));
  const toAdd = [...newSet].filter((v) => !oldSet.has(v)).slice(0, 12);
  const toRemove = [...oldSet].filter((v) => !newSet.has(v));
  await Promise.all([
    ...toAdd.map((value) =>
      fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "positive", value }),
      }).catch(() => null),
    ),
    ...toRemove.map((value) =>
      fetch("/api/keywords", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "positive", value }),
      }).catch(() => null),
    ),
  ]);
}

/** Deterministic blip coordinates (percent) around the radar face, per index. */
function blipPos(i: number): { top: string; left: string } {
  const golden = 2.399963; // golden-angle spread → even, organic scatter
  const a = i * golden;
  const r = 18 + ((i * 13) % 26); // 18–44% radius from centre
  return {
    top: `${50 + Math.sin(a) * r}%`,
    left: `${50 + Math.cos(a) * r}%`,
  };
}

// ── small presentational atoms ───────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[0.62rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </span>
  );
}

function Counter({ label, value, accent }: { label: string; value: number | null; accent?: boolean }) {
  // Remount the number node with a value-derived key so it re-fires the
  // `count-flash` animation each time the live figure ticks up — the increment
  // becomes something you *feel*, not just read.
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-2.5 transition-colors",
        value !== null && value > 0 ? "border-primary/25" : "border-border",
      )}
    >
      <div className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div
        key={value ?? "empty"}
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          value !== null && value > 0 && "animate-count-flash",
          accent ? "text-primary" : "text-foreground",
          value === null && "text-muted-foreground/40",
        )}
      >
        {value === null ? "—" : value}
      </div>
    </div>
  );
}

/** Live feed of the roles the scan finds — role + company only. Shows every
 * role found so far, newest first, in a scrollable list so the count can grow
 * without limit while staying legible. */
function ActivityFeed({ roles, active }: { roles: FoundRole[]; active: boolean }) {
  if (!active && roles.length === 0) return null;
  // Newest-first: `roles` arrives in ascending discovery order, so reverse it
  // for display — new finds should appear at the top, not get buried below.
  const shown = [...roles].reverse();

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background/60">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5">
        <span className="relative flex h-2 w-2">
          {active && (
            <span className="absolute inline-flex h-full w-full animate-ring-pulse rounded-full bg-ctp-green" />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", active ? "bg-ctp-green" : "bg-muted-foreground/40")} />
        </span>
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
          {active ? "Live activity" : "Found roles"}
        </span>
        {shown.length > 0 && (
          <span className="ml-auto font-mono text-[0.6rem] tabular-nums text-muted-foreground/70">
            {shown.length}
          </span>
        )}
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto px-3 py-2">
        {shown.length === 0 ? (
          <p className="font-mono text-[0.68rem] text-muted-foreground/50">Warming up the scanners…</p>
        ) : (
          shown.map((r) => (
            <div key={r.num} className="animate-ticker-in flex items-baseline gap-1.5 text-sm">
              <span className="truncate font-medium">{r.role}</span>
              <span className="shrink-0 text-xs text-muted-foreground">· {r.company}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** What the scan is doing, cycled through for the searching indicator below —
 * a mix of the real sources it hits and the matching it runs against them, so
 * the wait reads as "out combing the web for you" rather than an opaque bar. */
const SEARCH_STEPS = [
  "Searching boards.greenhouse.io…",
  "Matching titles against your keywords…",
  "Searching jobs.lever.co…",
  "Checking seniority & location fit…",
  "Searching jobs.ashbyhq.com…",
  "Filtering out the noise…",
];

/** A browser-bar-styled ticker that cycles through the boards being searched —
 * makes the otherwise-invisible server-side crawl legible as "we're out on
 * the web right now," without this component knowing anything about the
 * actual crawl's real-time state. */
function SearchTicker({ active }: { active: boolean }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setI((v) => (v + 1) % SEARCH_STEPS.length), 1700);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;

  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
      <Search className="h-3.5 w-3.5 shrink-0 animate-pulse-dot text-primary" />
      <span key={i} className="animate-fade-in truncate font-mono text-xs text-muted-foreground">
        {SEARCH_STEPS[i]}
      </span>
    </div>
  );
}

// ── the flow ──────────────────────────────────────────────────────────────────

export function OnboardingFlow({
  initial,
  activeCommand = null,
}: {
  initial: OnboardingState;
  /** A scan/evaluate job still running on the server at page load, if any. */
  activeCommand?: PipelineCommand | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { run, running, log } = usePipeline();

  const [onboarding, setOnboarding] = React.useState<OnboardingState>(initial);
  // An in-flight scan/evaluate means we're still on the score step — never the
  // reveal, even if `phaseFor` would jump there off partial server state.
  const [phase, setPhase] = React.useState<Phase>(() =>
    activeCommand ? "scan" : phaseFor(initial),
  );

  const [resumeState, setResumeState] = React.useState<ResumeState>(
    initial.profile.done ? "done" : "idle",
  );
  const [extracted, setExtracted] = React.useState<Record<string, unknown> | null>(null);
  const [scanStage, setScanStage] = React.useState<ScanStage>(() =>
    activeCommand == null ? "idle" : activeCommand.startsWith("evaluate") ? "scoring" : "scanning",
  );
  // Persisted roles-found count. The pipeline log is reset when the evaluate
  // run starts, so the live scan telemetry disappears during scoring — we keep
  // the number here (seeded from server state, only ever revised upward) so it
  // stays visible for the rest of the flow.
  const [rolesFound, setRolesFound] = React.useState<number>(initial.scan.count ?? 0);
  // The concrete roles the scan discovered (role + company) for the live feed.
  const [foundRoles, setFoundRoles] = React.useState<FoundRole[]>([]);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  // Leave onboarding for good: persist the one-way `onboardedAt` marker so the
  // `/` gate unlocks permanently, then navigate. If the POST fails we still
  // navigate — the gate re-checks server-side and will bounce back here only if
  // the marker truly didn't stick, so the user is never stranded.
  const finishOnboarding = React.useCallback(async () => {
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch {
      /* non-fatal — the `/` gate re-checks and redirects here if needed */
    }
    router.push("/");
  }, [router]);

  const refetchOnboarding = React.useCallback(async (): Promise<OnboardingState | null> => {
    try {
      const res = await fetch("/api/onboarding", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      const next = data.onboarding as OnboardingState;
      setOnboarding(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  // Persist edits the user makes to the parsed results, then refresh both the
  // shown data and the onboarding gates (a corrected name/title can flip
  // profile readiness).
  const saveExtracted = React.useCallback(
    async (patch: { name?: string; profile?: Record<string, unknown>; cv?: Record<string, unknown> }) => {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't save your changes");
      }
      const data = await res.json();
      setExtracted({ profile: data.profile ?? null, cv: data.cv ?? null });
      await refetchOnboarding();
    },
    [refetchOnboarding],
  );

  // Exact-position resume: if the résumé was already parsed before this load
  // (refresh / reopen), rehydrate the extracted fields so the profile step
  // shows the real data instead of an empty "add details" state.
  React.useEffect(() => {
    if (!initial.profile.done) return;
    let stop = false;
    void (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!stop) setExtracted({ profile: data.profile ?? null, cv: data.cv ?? null });
      } catch {
        /* non-fatal — the manual editor still works */
      }
    })();
    return () => {
      stop = true;
    };
  }, [initial.profile.done]);

  // Re-check onboarding gates when the tab regains focus, so filling fields on
  // the /profile page and coming back immediately reflects here (e.g. enables
  // "Find my roles") instead of showing stale state.
  React.useEffect(() => {
    const onFocus = () => void refetchOnboarding();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refetchOnboarding]);

  // The keyword filters that scanning needs are derived from the target roles.
  // If the profile is complete (target roles are a required field) but no
  // positive keywords exist yet — e.g. the user filled the profile by hand
  // instead of via a résumé — seed them from the target roles so "Find my
  // roles" isn't stuck disabled on a requirement the user can't see.
  const seedingKeywords = React.useRef(false);
  React.useEffect(() => {
    if (!onboarding.profile.done || onboarding.keywords.done || seedingKeywords.current) return;
    seedingKeywords.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const p = res.ok ? ((await res.json()).profile ?? {}) : {};
        const titles: string[] = p?.target_roles?.primary ?? p?.matching?.include_titles ?? [];
        if (titles.length > 0) {
          await syncKeywordsToTitles([], titles);
          await refetchOnboarding();
        }
      } catch {
        /* non-fatal — the keywords step still lets them add these by hand */
      } finally {
        seedingKeywords.current = false;
      }
    })();
  }, [onboarding.profile.done, onboarding.keywords.done, refetchOnboarding]);

  // ── résumé upload → extract → seed keywords ──
  async function handleFile(file: File) {
    setResumeState("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/profile/resume", { method: "POST", body: form });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed");
      }
      setResumeState("extracting");
      const ex = await fetch("/api/profile/resume/extract", { method: "POST" });
      if (!ex.ok) {
        const j = await ex.json().catch(() => ({}));
        throw new Error(
          ex.status === 422
            ? "We couldn't read that résumé — it may be scanned or image-only. Try a text PDF, or fill your profile in by hand."
            : j.error || "Couldn't extract your résumé",
        );
      }
      const { profile, cv } = await ex.json();
      setExtracted({ profile: profile ?? null, cv: cv ?? null });

      // Seed positive keyword filters from the candidate's target roles.
      const titles: string[] =
        profile?.target_roles?.primary ?? profile?.matching?.include_titles ?? [];
      await syncKeywordsToTitles([], titles);
      setResumeState("done");
      await refetchOnboarding();
    } catch (e) {
      setResumeState("error");
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  // ── scan → score chain ──
  // Progression is driven by the pipeline's `running` state (see the two
  // effects below), NOT by chained onDone callbacks. That's deliberate: the
  // scan runs on the server, so a refresh (or leaving and coming back) must be
  // able to resume the exact same run and keep advancing the chain — and after
  // a reload the provider re-attaches to the live job but the original
  // callbacks are gone. Deriving from `running` makes both the fresh and the
  // resumed paths behave identically.
  function startScan() {
    setScanStage("scanning");
    run("scan:fallback");
  }

  // If the user already scanned but hasn't evaluated, the scan step goes
  // straight to scoring.
  function startScoreOnly() {
    setScanStage("scoring");
    run("evaluate:all");
  }

  // Reflect the live (possibly re-attached, post-refresh) pipeline job in the
  // scan-screen stage, so a running scan never looks like it stopped or reset.
  // A running job also means we're NOT done — pull back from the reveal if a
  // reattach lands after mount (safety net for the server-side activeCommand).
  React.useEffect(() => {
    if (running === "scan" || running === "scan:fallback") {
      setScanStage("scanning");
      setPhase((ph) => (ph === "reveal" ? "scan" : ph));
    } else if (running && running.startsWith("evaluate")) {
      setScanStage("scoring");
      setPhase((ph) => (ph === "reveal" ? "scan" : ph));
    }
  }, [running]);

  // Advance the chain whenever a run finishes — including a run that was
  // re-attached after a reload, whose original onDone no longer exists. When a
  // scan completes we auto-start scoring; when scoring completes we settle on
  // "done". Guarded by real server state so it can't double-fire evaluate.
  const prevRunningRef = React.useRef<PipelineCommand | null>(running);
  React.useEffect(() => {
    const prev = prevRunningRef.current;
    prevRunningRef.current = running;
    if (!prev || running) return; // only act on a non-null → null transition
    void refetchOnboarding().then((next) => {
      if (!next) return;
      if (next.evaluate.done) setScanStage("done");
      else if (next.scan.done) run("evaluate:all"); // scan done, keep going
    });
  }, [running, refetchOnboarding, run]);

  const profileReady = onboarding.profile.done && onboarding.keywords.done;
  const tel = parseScanTelemetry(log);
  // Which of the four rail steps is active. The single scan screen advances the
  // rail from "Find" to "Score" as the run moves from scanning into evaluation.
  const stepIndex =
    phase === "profile"
      ? 0
      : phase === "reveal"
        ? 3
        : scanStage === "scoring" || scanStage === "done"
          ? 2
          : 1;

  // "Roles found" = roles that survived keyword matching (relevant), NOT the
  // total postings considered. Kept monotonic across the scan → evaluate
  // handoff (where the live log/telemetry resets) so it never flickers to 0.
  React.useEffect(() => {
    const live = Math.max(tel.relevant ?? 0, onboarding.scan.count ?? 0, foundRoles.length);
    setRolesFound((prev) => (live > prev ? live : prev));
  }, [tel.relevant, onboarding.scan.count, foundRoles.length]);

  // Pull the concrete matched roles (role + company) for the live feed, polling
  // while the scan/scoring runs and fetching once when done.
  React.useEffect(() => {
    if (scanStage === "idle") return;
    let stop = false;
    const fetchRoles = async () => {
      try {
        // 500 = the server's max page size — comfortably above any single
        // scan's yield, so every job found shows up in the live feed.
        const res = await fetch("/api/applications?limit=500", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (stop) return;
        setFoundRoles(
          (data.applications ?? []).map((a: { num: string; company: string; role: string }) => ({
            num: a.num,
            company: a.company,
            role: a.role,
          })),
        );
      } catch {
        /* transient — retry on the next tick */
      }
    };
    void fetchRoles();
    if (scanStage === "scanning" || scanStage === "scoring") {
      const id = setInterval(fetchRoles, 2000);
      return () => {
        stop = true;
        clearInterval(id);
      };
    }
    return () => {
      stop = true;
    };
  }, [scanStage]);

  // Counters reveal progressively as the run advances: "Roles found" is present
  // from the scan step on; "Scored" joins once evaluation starts; "Top score"
  // appears at the end — so by "done" all three read together.
  const scanCounters = [
    { label: "Roles found", value: rolesFound as number | null },
    {
      label: "Scored",
      value: scanStage === "scoring" || scanStage === "done" ? tel.scored : null,
    },
    { label: "Top score", value: scanStage === "done" ? tel.topScore : null, accent: true },
  ].filter((c) => c.value !== null);

  // ── Goal-gradient effect ──────────────────────────────────────────────────
  // Motivation to finish rises the closer the goal looks, so (1) we bank an
  // ENDOWED 20% just for signing in — the bar never starts empty (Nunes &
  // Drèze: endowed progress accelerates completion) — and (2) milestones are
  // weighted so each later step covers less ground, making the final push feel
  // short. The value still tracks real gate completion, so it's never a lie.
  let goalPct = 20; // endowed baseline
  if (resumeState === "done") goalPct = 40;
  if (profileReady) goalPct = 62;
  if (onboarding.scan.done) goalPct = 84;
  if (onboarding.evaluate.done || phase === "reveal") goalPct = 100;
  const remaining = 100 - goalPct;

  // Proximity copy intensifies as the goal nears (the gradient made explicit).
  const proximity =
    goalPct >= 100
      ? "Done — your matches are ready."
      : goalPct >= 80
        ? `So close — just ${remaining}% left.`
        : goalPct >= 55
          ? "Over halfway. You're a couple of clicks from your matches."
          : `You're already ${goalPct}% set up — we did the first part for you.`;

  const railNodes: { name: string; icon: React.ComponentType<{ className?: string }>; state: "done" | "current" | "todo" }[] =
    RAIL_STEPS.map((s, i) => ({
      name: s.name,
      icon: s.icon,
      state: (i < stepIndex ? "done" : i === stepIndex ? "current" : "todo") as "done" | "current" | "todo",
    }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* progress rail — endowed goal-gradient */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex flex-1 items-center gap-2">
          {railNodes.map((n, i) => {
            const Icon = n.icon;
            return (
              <React.Fragment key={n.name}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors",
                      n.state === "done" && "border-transparent bg-primary/15 text-primary",
                      n.state === "current" && "brand-gradient border-transparent text-white",
                      n.state === "todo" && "border-border text-muted-foreground",
                    )}
                  >
                    {n.state === "done" ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span
                    className={cn(
                      "hidden text-sm font-medium sm:block",
                      n.state === "todo" ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {n.name}
                  </span>
                </div>
                {i < railNodes.length - 1 && <div className="h-px flex-1 bg-border" aria-hidden="true" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="brand-gradient h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${goalPct}%` }}
        />
      </div>
      <p className="mb-8 flex items-center justify-between gap-2 font-mono text-[0.68rem] text-muted-foreground">
        <span className={cn(goalPct >= 80 && goalPct < 100 && "font-semibold text-primary")}>{proximity}</span>
        <span className="tabular-nums">{goalPct}%</span>
      </p>

      {/* ── PHASE: PROFILE (résumé-first, reciprocity) ── */}
      {phase === "profile" && (
        <div className="animate-fade-in-up">
          <Eyebrow>Step 1 of 4 · give us nothing but your résumé</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">We fill in the rest.</h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            No twelve-field form. Drop a PDF and watch your profile build itself — we do the work before we
            ask you for any.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {/* dropzone */}
            <Card
              className={cn(
                "relative flex min-h-[260px] flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border",
                (resumeState === "uploading" || resumeState === "extracting") && "overflow-hidden",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              {(resumeState === "uploading" || resumeState === "extracting") && (
                <div className="pointer-events-none absolute inset-0 animate-shimmer bg-[linear-gradient(115deg,transparent_30%,hsl(var(--brand-to)/0.18)_50%,transparent_70%)] bg-[length:220%_100%]" />
              )}
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                {resumeState === "done" ? (
                  <Check className="h-6 w-6 text-ctp-green" />
                ) : resumeState === "uploading" || resumeState === "extracting" ? (
                  <Spinner className="h-6 w-6 text-primary" />
                ) : (
                  <UploadCloud className="h-6 w-6 text-muted-foreground" />
                )}
              </span>
              <div>
                <p className="font-semibold">
                  {resumeState === "idle" && "Drop your résumé here"}
                  {resumeState === "uploading" && "Uploading…"}
                  {resumeState === "extracting" && "Reading your résumé…"}
                  {resumeState === "done" && "Profile built"}
                  {resumeState === "error" && "That didn't work"}
                </p>
                <p className="text-sm text-muted-foreground">PDF or DOCX · we never make you type it again</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                variant={resumeState === "done" ? "outline" : "default"}
                onClick={() => fileInput.current?.click()}
                disabled={resumeState === "uploading" || resumeState === "extracting"}
              >
                <FileText className="h-4 w-4" />
                {resumeState === "done" || resumeState === "error" ? "Choose another file" : "Choose file"}
              </Button>
            </Card>

            {/* auto-filled profile */}
            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <Eyebrow>Extracted profile</Eyebrow>
                <span
                  className={cn(
                    "font-mono text-[0.68rem]",
                    resumeState === "done" ? "text-ctp-green" : "text-muted-foreground",
                  )}
                >
                  {resumeState === "done" ? "✓ built" : resumeState === "extracting" ? "extracting…" : "idle"}
                </span>
              </div>
              <ExtractedFields extracted={extracted} visible={resumeState === "done"} onSave={saveExtracted} />
            </Card>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled={!profileReady}
              onClick={() => setPhase("scan")}
              className={cn(profileReady && "animate-attention")}
            >
              Find my roles <ArrowRight className="h-4 w-4" />
            </Button>
            {!profileReady && onboarding.profile.done && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Spinner className="h-3.5 w-3.5" /> Setting up your role filters…
              </p>
            )}
            {!profileReady && !onboarding.profile.done && (
              <p className="text-sm text-muted-foreground">
                {resumeState === "done" ? "Almost — your profile still needs " : "We still need "}
                {onboarding.profile.missing.slice(0, 3).join(", ") || "a few details"}.{" "}
                <Link href="/profile" className="font-medium text-primary underline underline-offset-2">
                  {resumeState === "done" ? "Finish it →" : "Fill it in →"}
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── PHASE: SCAN (authority + variable-reward anticipation) ── */}
      {phase === "scan" && (
        <div className="animate-fade-in-up">
          <Eyebrow>
            Step {scanStage === "scoring" || scanStage === "done" ? 3 : 2} of 4 · we go to work
          </Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            {scanStage === "idle"
              ? "Ready to scan the boards."
              : scanStage === "scanning"
                ? "Scanning the boards, live."
                : scanStage === "scoring"
                  ? "Scoring every match against your CV."
                  : "Done — here's what we found."}
          </h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            We comb Greenhouse, Ashby &amp; Lever and score each role on a weighted rubric — you watch it
            happen, so the result is earned, not arbitrary.
          </p>

          <Card className="mt-6 grid items-center gap-6 p-6 sm:grid-cols-[200px_1fr]">
            <div className="relative mx-auto aspect-square w-44">
              <div className="absolute inset-0 rounded-full border border-border bg-[radial-gradient(circle,hsl(var(--primary)/0.12)_0%,transparent_70%)]" />
              <div className="absolute inset-[18%] rounded-full border border-border" />
              <div className="absolute inset-[36%] rounded-full border border-border" />
              {scanStage !== "idle" && scanStage !== "done" && (
                <div className="absolute inset-0 animate-sweep rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,hsl(var(--primary)/0.35)_40deg,transparent_90deg)]" />
              )}
              {/* Detected-role blips — one lights up per scored role, capped so
                  the radar stays legible. Turns an abstract count into motion. */}
              {scanStage !== "idle" &&
                Array.from({ length: Math.min(tel.scored, 14) }).map((_, i) => {
                  const pos = blipPos(i);
                  return (
                    <span
                      key={i}
                      className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 animate-blip-in rounded-full bg-primary shadow-[0_0_6px_1px_hsl(var(--primary)/0.7)]"
                      style={{ top: pos.top, left: pos.left, animationDelay: `${(i % 6) * 60}ms` }}
                    />
                  );
                })}
              <div className="absolute inset-0 flex items-center justify-center">
                {scanStage === "done" ? (
                  <Check className="h-10 w-10 animate-scale-in text-ctp-green" />
                ) : (
                  <Radar className={cn("h-10 w-10 text-primary", scanStage !== "idle" && "animate-pulse-dot")} />
                )}
              </div>
            </div>

            {scanCounters.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {scanCounters.map((c) => (
                  <Counter key={c.label} label={c.label} value={c.value} accent={c.accent} />
                ))}
              </div>
            ) : (
              <p className="flex items-center text-sm text-muted-foreground">
                {scanStage === "idle"
                  ? "Your results will appear here as the scan runs."
                  : "Working…"}
              </p>
            )}

            <div className="sm:col-span-2">
              <SearchTicker active={scanStage === "scanning"} />
              <ActivityFeed roles={foundRoles} active={scanStage === "scanning" || scanStage === "scoring"} />
            </div>
          </Card>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {scanStage === "idle" &&
              (onboarding.scan.done ? (
                <Button size="lg" onClick={startScoreOnly}>
                  <Sparkles className="h-4 w-4" /> Score my roles
                </Button>
              ) : (
                <Button size="lg" onClick={startScan} className="animate-attention">
                  <Radar className="h-4 w-4" /> Start the scan
                </Button>
              ))}
            {(scanStage === "scanning" || scanStage === "scoring") && (
              <Button size="lg" disabled>
                <Spinner className="h-4 w-4" />
                {scanStage === "scanning" ? "Scanning…" : "Scoring…"}
              </Button>
            )}
            {scanStage === "done" && (
              <Button size="lg" onClick={() => setPhase("reveal")}>
                See my matches <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {running && (
              <span className="font-mono text-xs text-muted-foreground">
                this runs on our servers — you can leave and come back
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── PHASE: REVEAL (peak-end + variable reward) ── */}
      {phase === "reveal" && (
        <RevealStep onboarding={onboarding} telTop={tel.topScore} onFinish={finishOnboarding} onRescan={() => setPhase("scan")} />
      )}
    </div>
  );
}

// ── extracted-field list with staggered reveal ────────────────────────────────

function Chips({ items, tone = "muted" }: { items: string[]; tone?: "primary" | "muted" }) {
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {items.map((t) => (
        <span
          key={t}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            tone === "primary" ? "bg-primary/10 font-medium text-primary" : "bg-muted",
          )}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-card px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

function EditRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[0.6rem] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ExtractedFields({
  extracted,
  visible,
  onSave,
}: {
  extracted: Record<string, unknown> | null;
  visible: boolean;
  onSave: (patch: { name?: string; profile?: Record<string, unknown>; cv?: Record<string, unknown> }) => Promise<void>;
}) {
  const src = (extracted ?? {}) as { profile?: any; cv?: any };
  const p = src.profile ?? {};
  const c = src.cv ?? {};

  const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

  // Profile-side signal
  const name: string = p?.candidate?.full_name ?? "";
  const headline: string = p?.narrative?.headline ?? "";
  const titles: string[] = p?.matching?.include_titles?.length
    ? p.matching.include_titles
    : (p?.target_roles?.primary ?? []);
  const level: string = p?.target_roles?.archetypes?.[0]?.level ?? "";
  const supers: string[] = arr(p?.narrative?.superpowers);
  const city: string = p?.location?.city || p?.candidate?.location || "";
  const visa: string = p?.location?.visa_status ?? "";
  const email: string = p?.candidate?.email ?? "";
  const phone: string = p?.candidate?.phone ?? "";
  const links: string[] = [
    nonEmpty(p?.candidate?.linkedin) && "LinkedIn",
    nonEmpty(p?.candidate?.github) && "GitHub",
    nonEmpty(p?.candidate?.portfolio_url) && "Portfolio",
  ].filter(Boolean) as string[];

  // CV-side signal
  const skills: string[] = arr(c?.skills).flatMap((g: any) => arr(g?.items));
  const experience = arr(c?.experience);
  const education = arr(c?.education);
  const certs = arr(c?.certifications);
  const projects = arr(c?.projects);
  const languages: string[] = arr(c?.languages)
    .map((l: any) => (typeof l === "string" ? l : l?.language))
    .filter(nonEmpty);

  // Build only the rows we actually have data for — never a blank "—".
  const rows: { label: string; value: React.ReactNode }[] = [];
  const add = (label: string, value: React.ReactNode) => rows.push({ label, value });

  if (nonEmpty(name)) add("Name", name);
  if (nonEmpty(headline)) add("Headline", headline);
  if (titles.length) add("Target titles", <Chips items={titles.slice(0, 4)} tone="primary" />);
  if (nonEmpty(level)) add("Seniority", level);
  if (skills.length) add("Skills", <Chips items={skills.slice(0, 8)} />);
  if (supers.length) add("Strengths", <Chips items={supers.slice(0, 3)} />);
  if (experience.length) {
    const top = experience[0] ?? {};
    const lead = [top.role, top.company].filter(Boolean).join(" · ");
    add(
      "Experience",
      <span>
        {nonEmpty(lead) ? <span className="font-medium">{lead}</span> : `${experience.length} roles`}
        {experience.length > 1 && nonEmpty(lead) && (
          <span className="text-muted-foreground"> +{experience.length - 1} more</span>
        )}
      </span>,
    );
  }
  if (projects.length) {
    const names = projects.map((x: any) => x?.name).filter(nonEmpty);
    add(
      "Projects",
      names.length ? <Chips items={names.slice(0, 3)} /> : `${projects.length} projects`,
    );
  }
  if (education.length) {
    const e = education[0] ?? {};
    const lead = [e.degree, e.institution].filter(Boolean).join(", ");
    add(
      "Education",
      <span>
        {nonEmpty(lead) ? <span className="font-medium">{lead}</span> : `${education.length} entries`}
        {education.length > 1 && nonEmpty(lead) && (
          <span className="text-muted-foreground"> +{education.length - 1} more</span>
        )}
      </span>,
    );
  }
  if (certs.length) {
    const names = certs.map((x: any) => x?.name).filter(nonEmpty);
    add("Certifications", names.length ? <Chips items={names.slice(0, 3)} /> : `${certs.length}`);
  }
  if (languages.length) add("Languages", <Chips items={languages.slice(0, 5)} />);
  const summary: string = p?.narrative?.exit_story || c?.summary || "";
  if (nonEmpty(city)) add("Location", city);
  if (links.length) add("Links", <Chips items={links} />);
  if (nonEmpty(email)) add("Email", <span className="break-all">{email}</span>);
  if (nonEmpty(phone)) add("Phone", phone);
  if (nonEmpty(visa)) add("Visa", visa);

  // ── editing ──
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [dName, setDName] = React.useState("");
  const [dHeadline, setDHeadline] = React.useState("");
  const [dTitles, setDTitles] = React.useState("");
  const [dCity, setDCity] = React.useState("");
  const [dVisa, setDVisa] = React.useState("");
  const [dSummary, setDSummary] = React.useState("");

  const beginEdit = () => {
    setErr(null);
    setDName(name);
    setDHeadline(headline);
    setDTitles(titles.join(", "));
    setDCity(city);
    setDVisa(visa);
    setDSummary(summary);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const primary = dTitles
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // Keep the positive keyword filters in sync with the target roles: add
      // the newly-added titles, drop the removed ones. Only titles the user
      // changed are touched, so any keywords they added by hand are preserved.
      await syncKeywordsToTitles(titles, primary);

      const nextProfile: Record<string, any> = {
        candidate: { ...(p.candidate ?? {}), full_name: dName.trim() },
        narrative: { ...(p.narrative ?? {}), headline: dHeadline.trim(), exit_story: dSummary.trim() },
        target_roles: { ...(p.target_roles ?? {}), primary },
        location: { ...(p.location ?? {}), city: dCity.trim(), visa_status: dVisa.trim() },
      };
      // Keep the scan's matching prefs aligned with the edited titles/location.
      nextProfile.matching = deriveMatchingDefaults(nextProfile);
      await onSave({
        name: dName.trim(),
        profile: nextProfile,
        cv: { summary: dSummary.trim() },
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save your changes");
    } finally {
      setSaving(false);
    }
  };

  if (!visible) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Your name, roles, skills, experience, education and more will appear here — pulled straight from your
        résumé.
      </p>
    );
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <EditRow label="Name">
            <input className={inputCls} value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Full name" />
          </EditRow>
          <EditRow label="Headline">
            <input className={inputCls} value={dHeadline} onChange={(e) => setDHeadline(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
          </EditRow>
        </div>
        <EditRow label="Target titles (comma-separated)">
          <input className={inputCls} value={dTitles} onChange={(e) => setDTitles(e.target.value)} placeholder="Backend Engineer, Platform Engineer" />
        </EditRow>
        <div className="grid gap-3 sm:grid-cols-2">
          <EditRow label="Location">
            <input className={inputCls} value={dCity} onChange={(e) => setDCity(e.target.value)} placeholder="City / region" />
          </EditRow>
          <EditRow label="Visa status">
            <input className={inputCls} value={dVisa} onChange={(e) => setDVisa(e.target.value)} placeholder="e.g. Citizen, Needs sponsorship" />
          </EditRow>
        </div>
        <EditRow label="Professional summary">
          <textarea
            className={cn(inputCls, "h-auto min-h-[72px] resize-y py-1.5")}
            value={dSummary}
            onChange={(e) => setDSummary(e.target.value)}
            placeholder="A short summary of your background and what you're looking for…"
          />
        </EditRow>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            Save changes
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
        <p className="text-[0.68rem] text-muted-foreground">
          Skills, experience &amp; education parsed from your résumé are saved — fine-tune them anytime in{" "}
          <Link href="/profile" className="text-primary underline underline-offset-2">
            your full profile
          </Link>
          .
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">
          We read your résumé but couldn&apos;t pull structured fields from it.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={beginEdit}>
          <Pencil className="h-3.5 w-3.5" /> Add details
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="max-h-[380px] overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="flex animate-fade-in-up items-start justify-between gap-3 border-b border-dashed border-border py-2 last:border-0"
            style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}
          >
            <span className="whitespace-nowrap pt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-muted-foreground">
              {r.label}
            </span>
            <span className="text-right text-sm font-medium">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[0.68rem] text-muted-foreground">Parsed from your résumé — correct anything that&apos;s off.</p>
        <Button size="sm" variant="outline" onClick={beginEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
    </div>
  );
}

// ── reveal ─────────────────────────────────────────────────────────────────────

function RevealStep({
  onboarding,
  telTop,
  onFinish,
  onRescan,
}: {
  onboarding: OnboardingState;
  telTop: number | null;
  onFinish: () => void;
  onRescan: () => void;
}) {
  const top = onboarding.topScore ?? telTop ?? 0;
  const strong = onboarding.evaluate.strong;
  const shown = useCountUp(top, true);
  const C = 326.7;
  const offset = C * (1 - shown / 5);
  const [barsIn, setBarsIn] = React.useState(false);
  const [celebrate, setCelebrate] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setBarsIn(true), 400);
    return () => clearTimeout(t);
  }, []);

  // Peak-end payoff: fire confetti + a haptic tap once, right as the score ring
  // finishes filling — but only when there's actually something to celebrate.
  React.useEffect(() => {
    if (strong === 0) return;
    const t = setTimeout(() => {
      setCelebrate(true);
      haptic([12, 40, 18]);
    }, 900);
    return () => clearTimeout(t);
  }, [strong]);

  // Honest weak-scan branch: setup done, nothing cleared the bar.
  if (strong === 0) {
    return (
      <div className="animate-fade-in-up">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ctp-yellow/20">
              <Radar className="h-5 w-5 text-ctp-yellow" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                Nothing cleared your bar yet — and that&apos;s the point.
              </h1>
              <p className="mt-2 max-w-prose text-muted-foreground">
                We screened {onboarding.scan.count} role{onboarding.scan.count === 1 ? "" : "s"}; none were
                strong matches. We&apos;d rather show you zero great roles than a pile of mediocre ones — widen
                the net and we&apos;ll keep looking.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/profile" className="inline-flex">
              <Button>
                <MapPin className="h-4 w-4" /> Widen locations
              </Button>
            </Link>
            <Button variant="outline" onClick={onRescan}>
              <RotateCw className="h-4 w-4" /> Scan again
            </Button>
            <Button variant="ghost" onClick={onFinish}>
              Go to dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />
      <Eyebrow>Step 4 of 4 · the payoff</Eyebrow>
      <div className="mt-4 grid items-center gap-8 sm:grid-cols-[220px_1fr]">
        <div className="relative mx-auto h-52 w-52">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary)/0.4))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-extrabold tabular-nums tracking-tight">
              {shown.toFixed(1)}
              <span className="text-xl text-muted-foreground">/5</span>
            </span>
            <span className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
              Top match
            </span>
          </div>
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            We found <span className="text-primary">{strong}</span> role{strong === 1 ? "" : "s"} that fit you.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your best scores {top.toFixed(1)}/5. Every match is graded on the same weighted rubric — here&apos;s
            what we measured:
          </p>
          <div className="mt-4 grid gap-2.5">
            {DIMENSIONS.map((d, i) => (
              <div key={d.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{d.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{d.weight}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: barsIn ? `${d.weight * 2.4}%` : 0, transitionDelay: `${i * 90}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button size="lg" onClick={onFinish}>
              <PartyPopper className="h-4 w-4" /> Go to my command center <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

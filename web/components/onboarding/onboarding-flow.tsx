"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Keyboard, RotateCw, Search, Square } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { Page, PageHeader } from "@/components/page";
import { usePipeline } from "@/components/pipeline-provider";
import { FitMeter } from "@/components/status-badge";
import { FriendlyError, friendlyError } from "@/lib/errors";
import { parseScanTelemetry } from "@/lib/scan-telemetry";
import { deriveMatchingDefaults } from "@/lib/matching-defaults";
import { cn } from "@/lib/utils";
import type { OnboardingState } from "@/lib/types";
import type { PipelineCommand } from "@/lib/pipeline";

import { ExtractedProfile, type ProfilePatch } from "./extracted-profile";
import { RevealStep } from "./reveal-step";
import { ReplaceResumeButton, ResumeDropZone } from "./resume-upload";

type Phase = "profile" | "scan" | "reveal";
type ResumeState = "idle" | "uploading" | "extracting" | "done" | "error";
type ScanStage = "idle" | "scanning" | "scoring" | "done";
/** "Type it in" path: off, loading what's already saved, or showing the form. */
type TypeIn = "off" | "loading" | "on";

/**
 * The three steps shown at the top — kept to one short word or two so all
 * three fit side by side on a phone. The scan screen covers both finding jobs
 * and checking how well each one fits.
 */
const STEPS = ["Résumé", "Find jobs", "Matches"];
const STEP_INDEX: Record<Phase, number> = { profile: 0, scan: 1, reveal: 2 };

const SCAN_TITLE: Record<ScanStage, string> = {
  idle: "Ready to look for jobs",
  scanning: "Looking for jobs that match you…",
  scoring: "Checking how well each job fits you…",
  done: "Your matches are ready",
};

/** Said once per screen: how long it takes, and that leaving is fine. */
const TAKES_A_WHILE = "It takes a few minutes, and you can leave this page while we work.";

/**
 * Lets a long button label wrap onto a second line on a narrow phone instead
 * of being cut off with "…". Keeps the 56px minimum height of `size="lg"`.
 */
const WRAPPING_LABEL = "h-auto min-h-14 whitespace-normal py-2";

function phaseFor(o: OnboardingState): Phase {
  if (!o.profile.done || !o.keywords.done) return "profile";
  if (!o.scan.done || !o.evaluate.done) return "scan";
  return "reveal";
}

/** A role discovered by the scan — the only shape the found-jobs list needs. */
type FoundRole = { num: string; company: string; role: string };

/** One plain number with its label underneath — no animation, no color-only meaning. */
function Count({ label, value }: { label: string; value: number }) {
  return (
    <VStack gap={0.5}>
      <Text color="secondary">{label}</Text>
      <Text size="3xl" weight="semibold" hasTabularNumbers>
        {value}
      </Text>
    </VStack>
  );
}

/**
 * The three steps across the top. Astryx's Stepper fixes its numbers at 13px
 * in 16px circles, which is too small to read for many people, so this is a
 * plain ordered list instead: 18px numbers in 40px circles, 18px labels. A
 * finished step shows a check and the word "Done", and the current one says
 * "Now" — the meaning never rests on colour alone.
 */
function SetupSteps({ active }: { active: number }) {
  return (
    <ol aria-label="Getting set up" className="grid grid-cols-3 gap-2">
      {STEPS.map((name, i) => {
        const isDone = i < active;
        const isCurrent = i === active;
        return (
          <li
            key={name}
            aria-current={isCurrent ? "step" : undefined}
            className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-start"
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full border-2",
                isDone && "border-success bg-success/10 text-success",
                isCurrent && "border-primary bg-primary text-primary-foreground",
                !isDone && !isCurrent && "border-input text-muted-foreground",
              )}
            >
              {isDone ? (
                <Icon icon={Check} color="inherit" size="md" />
              ) : (
                <Text weight="semibold" color="inherit" hasTabularNumbers>
                  {i + 1}
                </Text>
              )}
            </span>
            <VStack gap={0} className="min-w-0">
              <Text weight={isCurrent ? "semibold" : "normal"} color={isDone || isCurrent ? "primary" : "secondary"}>
                {name}
              </Text>
              {(isDone || isCurrent) && <Text color="secondary">{isDone ? "Done" : "Now"}</Text>}
            </VStack>
          </li>
        );
      })}
    </ol>
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
  const { run, cancel, running, percent, progressLabel, log } = usePipeline();

  const [onboarding, setOnboarding] = React.useState<OnboardingState>(initial);
  // An in-flight scan/evaluate means we're still on the score step — never the
  // reveal, even if `phaseFor` would jump there off partial server state.
  const [phase, setPhase] = React.useState<Phase>(() =>
    activeCommand ? "scan" : phaseFor(initial),
  );

  const [resumeState, setResumeState] = React.useState<ResumeState>(
    initial.profile.done ? "done" : "idle",
  );
  const [resumeError, setResumeError] = React.useState<string | null>(null);
  // The last file picked, so "Try again" can resend it without re-choosing.
  const lastFile = React.useRef<File | null>(null);
  const [extracted, setExtracted] = React.useState<Record<string, unknown> | null>(null);
  // True while a refresh re-reads the already-parsed profile (see rehydrate below).
  const [rehydrating, setRehydrating] = React.useState(initial.profile.done);
  // While the parsed-profile form is open, its "Save" is the step's main
  // button — "Continue" waits so unsaved edits aren't skipped past.
  const [editingProfile, setEditingProfile] = React.useState(false);
  // No résumé file: the same profile form, opened empty, right here in the flow.
  const [typeIn, setTypeIn] = React.useState<TypeIn>("off");
  const [typeInError, setTypeInError] = React.useState<string | null>(null);
  const [scanStage, setScanStage] = React.useState<ScanStage>(() =>
    activeCommand == null ? "idle" : activeCommand.startsWith("evaluate") ? "scoring" : "scanning",
  );
  // The concrete roles the scan discovered (role + company) for the found-jobs list.
  const [foundRoles, setFoundRoles] = React.useState<FoundRole[]>([]);
  // "Stop searching": set when the person presses it, cleared once the run has
  // actually ended. `stopRequested` is read by the chaining effect below so a
  // stopped run never rolls on into (or restarts) the fit check.
  const stopRequested = React.useRef(false);
  const [stopping, setStopping] = React.useState(false);
  const [stopped, setStopped] = React.useState(false);

  // Leave onboarding for good: persist the one-way `onboardedAt` marker so the
  // `/` gate unlocks permanently, then navigate (to the job list by default, or
  // for example `/?job=<num>` to open one job). If the POST fails we still
  // navigate — the gate re-checks server-side and will bounce back here only if
  // the marker truly didn't stick, so the user is never stranded.
  const finishOnboarding = React.useCallback(
    async (to: string = "/") => {
      try {
        await fetch("/api/onboarding", { method: "POST" });
      } catch {
        /* non-fatal — the `/` gate re-checks and redirects here if needed */
      }
      router.push(to);
    },
    [router],
  );

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
    async (patch: ProfilePatch) => {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      // The server's own text can be a raw database error — the form shows a
      // plain sentence via `friendlyError` instead.
      if (!res.ok) throw new Error(`Saving the profile failed: HTTP ${res.status}`);
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
      } finally {
        if (!stop) setRehydrating(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [initial.profile.done]);

  // Re-check onboarding gates when the tab regains focus, so filling fields on
  // the /profile page and coming back immediately reflects here (for example,
  // it enables "Continue") instead of showing stale state.
  React.useEffect(() => {
    const onFocus = () => void refetchOnboarding();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refetchOnboarding]);

  // The Job Matching prefs that scanning needs are derived from the target
  // roles. If the profile is complete (target roles are a required field) but
  // matching prefs aren't set yet — for example, the user filled the profile by
  // hand instead of via a résumé — derive and save them so "Continue" isn't
  // stuck disabled on a requirement the user can't see.
  const seedingMatching = React.useRef(false);
  React.useEffect(() => {
    if (!onboarding.profile.done || onboarding.keywords.done || seedingMatching.current) return;
    seedingMatching.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const p = res.ok ? ((await res.json()).profile ?? {}) : {};
        const matching = deriveMatchingDefaults(p);
        if (matching.include_titles.length > 0) {
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: { matching } }),
          });
          await refetchOnboarding();
        }
      } catch {
        /* non-fatal — the Job Matching section still lets them fill this in by hand */
      } finally {
        seedingMatching.current = false;
      }
    })();
  }, [onboarding.profile.done, onboarding.keywords.done, refetchOnboarding]);

  // ── résumé upload → extract → seed keywords ──
  async function handleFile(file: File) {
    lastFile.current = file;
    setTypeIn("off");
    setResumeError(null);
    setResumeState("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/profile/resume", { method: "POST", body: form });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        // A 400 is one of our own checks (file type or size), worded for
        // people. Anything else can be raw server text, so it stays hidden.
        throw up.status === 400 && typeof j.error === "string"
          ? new FriendlyError(j.error)
          : new Error(`Upload failed: HTTP ${up.status}`);
      }
      setResumeState("extracting");
      const ex = await fetch("/api/profile/resume/extract", { method: "POST" });
      if (!ex.ok) {
        throw ex.status === 422
          ? new FriendlyError(
              "We couldn't read that résumé — it may be a scan or a picture. Try a PDF with selectable text, or type your details in yourself.",
            )
          : new Error(`Reading the résumé failed: HTTP ${ex.status}`);
      }
      const { profile, cv } = await ex.json();
      setExtracted({ profile: profile ?? null, cv: cv ?? null });
      setResumeState("done");
      await refetchOnboarding();
    } catch (e) {
      setResumeState("error");
      setResumeError(friendlyError(e));
    }
  }

  function onPickFile(file: File) {
    void handleFile(file);
  }

  // ── no résumé file: type it in ──
  // Start from whatever is already saved (for example, details typed into the
  // full profile earlier). Saving replaces whole sections of the profile, so
  // opening the form blank over saved data would wipe those details out.
  async function startTypeIn() {
    setTypeInError(null);
    setTypeIn("loading");
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) throw new Error(`Loading the profile failed: HTTP ${res.status}`);
      const data = await res.json();
      setExtracted({ profile: data.profile ?? null, cv: data.cv ?? null });
      setTypeIn("on");
    } catch (e) {
      setTypeIn("off");
      setTypeInError(friendlyError(e));
    }
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
    setStopped(false);
    setScanStage("scanning");
    run("scan:fallback");
  }

  // If the user already scanned but hasn't evaluated, the scan step goes
  // straight to scoring.
  function startScoreOnly() {
    setStopped(false);
    setScanStage("scoring");
    run("evaluate:all");
  }

  function stopSearch() {
    stopRequested.current = true;
    setStopping(true);
    cancel();
  }

  // `cancel()` can only reach a job once the server has handed back its id, so
  // a Stop pressed in the first moment of a run would otherwise be lost. Keep
  // asking until the run really ends (asking twice is harmless).
  React.useEffect(() => {
    if (!stopping || !running) return;
    const id = setInterval(cancel, 2000);
    return () => clearInterval(id);
  }, [stopping, running, cancel]);

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
  // search completes we auto-start scoring; when scoring completes we settle on
  // "done". Guarded by real server state so it can't double-fire evaluate.
  const prevRunningRef = React.useRef<PipelineCommand | null>(running);
  React.useEffect(() => {
    const prev = prevRunningRef.current;
    prevRunningRef.current = running;
    if (!prev || running) return; // only act on a non-null → null transition
    const wasSearch = prev === "scan" || prev === "scan:fallback";
    void refetchOnboarding().then((next) => {
      // Read here, not before the refetch: Stop can be pressed in the moment
      // between the run ending and this answer arriving.
      const userStopped = stopRequested.current;
      stopRequested.current = false;
      setStopping(false);
      if (userStopped) {
        // The person stopped it: back to the start of this step, and never
        // roll on into (or restart) the fit check.
        setStopped(true);
        setScanStage("idle");
      } else if (next?.evaluate.done) {
        setScanStage("done");
      } else if (wasSearch && next?.scan.done) {
        run("evaluate:all"); // search done, keep going
      } else {
        // A fit check that ended short (it failed, or nothing was found)
        // settles back on this step's own button rather than re-running
        // itself in a loop.
        setScanStage("idle");
      }
    });
  }, [running, refetchOnboarding, run]);

  const profileReady = onboarding.profile.done && onboarding.keywords.done;
  const tel = parseScanTelemetry(log);

  // Pull the concrete matched roles (role + company) for the found-jobs list,
  // polling while the scan/scoring runs and fetching once when done. The API
  // returns newest first, so new finds land at the top of the list as-is.
  React.useEffect(() => {
    if (scanStage === "idle") return;
    let stop = false;
    const fetchRoles = async () => {
      try {
        // 500 = the server's max page size — comfortably above any single
        // scan's yield, so every job found shows up in the list.
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

  const resumeBusy = resumeState === "uploading" || resumeState === "extracting";
  // The profile card shows once a résumé has been read, or once the person
  // chose to type their details in instead.
  const isTypingIn = typeIn === "on" && resumeState !== "done";
  const showProfile = resumeState === "done" || isTypingIn;
  const scanRunning = scanStage === "scanning" || scanStage === "scoring";
  // "Jobs found" reads off the same `foundRoles` list shown underneath it, so
  // the count never disagrees with the list. "Jobs checked" only counts once
  // checking has actually started.
  const jobsChecked = scanStage === "scoring" || scanStage === "done" ? tel.scored : 0;
  // The live log's top score, or — after a reload, when there's no log — the
  // server's (refetched when the run finished).
  const bestMatch = scanStage === "done" ? (tel.topScore ?? onboarding.topScore) : null;

  const scanDescription =
    scanStage === "scanning" || scanStage === "scoring"
      ? "This can take a few minutes. You can leave this page — we'll keep working."
      : scanStage === "done"
        ? "We searched job sites and checked how well each job fits you."
        : onboarding.scan.done
          ? `We've already found ${onboarding.scan.count} ${onboarding.scan.count === 1 ? "job" : "jobs"} for you. Next, we'll check how well each one fits. ${TAKES_A_WHILE}`
          : `We'll search job sites for roles that match your résumé, then check how well each one fits you. ${TAKES_A_WHILE}`;

  return (
    <Page width="narrow">
      <SetupSteps active={STEP_INDEX[phase]} />

      {/* ── STEP 1: résumé → profile ── */}
      {phase === "profile" && (
        <VStack gap={6}>
          <PageHeader
            title={isTypingIn ? "Tell us about yourself" : "Start with your résumé"}
            description={
              isTypingIn
                ? "We'll use this to find jobs that fit you. You can change anything afterwards."
                : "We'll read it and fill in your profile for you. You can change anything afterwards."
            }
          />

          {resumeState === "done" ? (
            <HStack gap={3} vAlign="center" role="status" padding={4} className="rounded-lg bg-primary/10">
              <Icon icon={CheckCircle2} color="accent" size="lg" />
              <Text type="large">Done — here&apos;s what we found</Text>
            </HStack>
          ) : isTypingIn ? null : (
            <VStack gap={4}>
              <ResumeDropZone
                onFile={onPickFile}
                busyText={
                  resumeState === "uploading"
                    ? "Uploading…"
                    : resumeState === "extracting"
                      ? "Reading your résumé…"
                      : null
                }
                // A profile filled in by hand can already be ready — then
                // "Continue" is the main button and the upload is optional.
                isPrimary={!profileReady}
              />
              {resumeState === "error" && resumeError && (
                <Banner
                  status="error"
                  role="alert"
                  title="That didn't work"
                  collapsible={false}
                  endContent={
                    <Button
                      label="Try again"
                      icon={<Icon icon={RotateCw} />}
                      onClick={() => {
                        if (lastFile.current) void handleFile(lastFile.current);
                      }}
                    />
                  }
                >
                  <Text>{resumeError}</Text>
                </Banner>
              )}
              {!resumeBusy && !onboarding.profile.done && (
                <VStack gap={3}>
                  <Button
                    variant="secondary"
                    size="lg"
                    label="I don't have a résumé file — type it in"
                    icon={<Icon icon={Keyboard} />}
                    isLoading={typeIn === "loading"}
                    onClick={() => void startTypeIn()}
                    className={cn(WRAPPING_LABEL, "w-full sm:w-auto sm:self-start")}
                  />
                  {typeInError && (
                    <Banner
                      status="error"
                      role="alert"
                      title="We couldn't open the form"
                      collapsible={false}
                    >
                      <Text>{typeInError}</Text>
                    </Banner>
                  )}
                </VStack>
              )}
            </VStack>
          )}

          {showProfile && (
            <ExtractedProfile
              extracted={extracted}
              isLoading={resumeState === "done" && rehydrating}
              onSave={saveExtracted}
              onEditingChange={setEditingProfile}
              missing={onboarding.profile.done ? [] : onboarding.profile.missing}
              isTypedIn={isTypingIn}
              startInEditor={isTypingIn}
              // Cancelled before anything was saved: back to the résumé choice.
              onCancelEmpty={isTypingIn ? () => setTypeIn("off") : undefined}
            />
          )}

          {editingProfile ? null : profileReady ? (
            <HStack>
              <Button
                variant="primary"
                size="lg"
                label="Continue"
                endContent={<Icon icon={ArrowRight} />}
                onClick={() => setPhase("scan")}
              />
            </HStack>
          ) : onboarding.profile.done ? (
            <HStack gap={3} vAlign="center" role="status">
              <Spinner size="md" />
              <Text color="secondary">Setting up your job search…</Text>
            </HStack>
          ) : null}

          {showProfile && !editingProfile && (
            <ReplaceResumeButton
              onFile={onPickFile}
              label={resumeState === "done" ? "Use a different résumé" : "Use a résumé file instead"}
            />
          )}
        </VStack>
      )}

      {/* ── STEP 2: find jobs, then check how well each fits ── */}
      {phase === "scan" && (
        <VStack gap={6}>
          <PageHeader title={SCAN_TITLE[scanStage]} description={scanDescription} />

          {stopped && scanStage === "idle" && (
            <Banner
              status="info"
              role="status"
              title="Search stopped."
              description="You can start again whenever you're ready."
              collapsible={false}
            />
          )}

          {scanStage !== "idle" && (
            <Card>
              <VStack gap={5}>
                <VStack gap={2}>
                  <ProgressBar
                    label={SCAN_TITLE[scanStage]}
                    isLabelHidden
                    // A real percentage once the run reports one; until then
                    // (for example, while the search is still matching) it
                    // just shows that work is going on.
                    isIndeterminate={scanRunning && percent === null}
                    value={scanStage === "done" ? 100 : (percent ?? 0)}
                    variant={scanStage === "done" ? "success" : "accent"}
                  />
                  {scanRunning && progressLabel && (
                    <Text color="secondary" hasTabularNumbers>
                      {progressLabel}
                    </Text>
                  )}
                  {scanStage === "done" && (
                    <HStack gap={2} vAlign="center">
                      <Icon icon={CheckCircle2} color="success" />
                      <Text>Finished</Text>
                    </HStack>
                  )}
                </VStack>
                <Grid columns={2} gap={4}>
                  <Count label="Jobs found" value={foundRoles.length} />
                  <Count label="Jobs checked" value={jobsChecked} />
                </Grid>
                {bestMatch !== null && (
                  <VStack gap={1}>
                    <Text color="secondary">Best match</Text>
                    <FitMeter score={bestMatch} size="lg" />
                  </VStack>
                )}
              </VStack>
            </Card>
          )}

          {/* While a run is going, the only thing to press is Stop. Otherwise:
              this stage's one main action, and a way back to the résumé. */}
          {scanRunning ? (
            <HStack>
              <Button
                variant="secondary"
                label={stopping ? "Stopping…" : "Stop searching"}
                icon={<Icon icon={Square} />}
                isLoading={stopping}
                onClick={stopSearch}
              />
            </HStack>
          ) : (
            <HStack gap={3} wrap="wrap" vAlign="center">
              {scanStage === "done" ? (
                <Button
                  variant="primary"
                  size="lg"
                  label="See my matches"
                  endContent={<Icon icon={ArrowRight} />}
                  onClick={() => setPhase("reveal")}
                />
              ) : onboarding.scan.done ? (
                <Button
                  variant="primary"
                  size="lg"
                  label="Check how well they fit"
                  onClick={startScoreOnly}
                />
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  label="Find jobs"
                  icon={<Icon icon={Search} />}
                  onClick={startScan}
                />
              )}
              <Button
                variant="secondary"
                label="Back to my résumé"
                icon={<Icon icon={ArrowLeft} />}
                onClick={() => setPhase("profile")}
              />
            </HStack>
          )}

          {scanStage !== "idle" &&
            (foundRoles.length > 0 ? (
              <VStack gap={3}>
                <Heading level={2}>{scanRunning ? "Jobs found so far" : "Jobs we found"}</Heading>
                <VStack isScrollable className="max-h-96" tabIndex={0} role="region" aria-label="Jobs found">
                  <List hasDividers>
                    {foundRoles.map((r) => (
                      <ListItem
                        key={r.num}
                        label={r.role}
                        description={<Text color="secondary">{r.company}</Text>}
                      />
                    ))}
                  </List>
                </VStack>
              </VStack>
            ) : scanRunning ? (
              <Text color="secondary">Jobs will show up here as we find them.</Text>
            ) : null)}
        </VStack>
      )}

      {/* ── STEP 3: the matches ── */}
      {phase === "reveal" && (
        <RevealStep
          onboarding={onboarding}
          telTop={tel.topScore}
          onFinish={finishOnboarding}
          onRescan={() => {
            // "Search again" means a fresh search, not a revisit of the
            // finished step — start it right away (checking follows automatically).
            setPhase("scan");
            startScan();
          }}
        />
      )}
    </Page>
  );
}

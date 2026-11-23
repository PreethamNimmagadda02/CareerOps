"use client";

import * as React from "react";
import { ArrowDown, ArrowRight, Check, ListChecks, Lock, MapPin, Search, Square } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { matchText } from "@/lib/labels";
import type { Application, OnboardingState } from "@/lib/types";
import type { PipelineCommand } from "@/lib/pipeline";

/**
 * The dashboard collapses `OnboardingState`'s 4 backend gates (profile,
 * keywords, scan, evaluate) into 3 visible steps — "keywords" (Job Matching
 * prefs) is folded into "profile" since both now live on the same profile
 * page, with nothing left on the dashboard to separately manage.
 */
type DashboardStep = "profile" | "scan" | "evaluate";

interface LaunchPadProps {
  onboarding: OnboardingState | null;
  loading: boolean;
  /** The pipeline command currently running, if any. */
  running: PipelineCommand | null;
  /** 0–100 live progress for the current run, or null before telemetry exists. */
  percent: number | null;
  progressLabel: string | null;
  /** Search for jobs, then check how well the new ones fit. */
  onFindJobs: () => void;
  /** Check how well any not-yet-checked jobs fit. */
  onCheckJobs: () => void;
  /** Stop the current run. */
  onStop: () => void;
  /** The best-fitting job loaded so far — named in the "new best match" card. */
  bestJob: Application | null;
  /** Open (expand + scroll to) a job in the list. */
  onShowJob: (num: string) => void;
}

const COPY: Record<DashboardStep, { title: string; help: string; doneText: (o: OnboardingState) => string }> = {
  profile: {
    title: "Add your résumé and what you're looking for",
    help: "We'll fill in most of it from your résumé.",
    doneText: () => "Done",
  },
  scan: {
    title: "Find open jobs",
    help: "We search job sites, then check how well each job fits you.",
    doneText: (o) => `Done — ${o.scan.count} job${o.scan.count === 1 ? "" : "s"} found`,
  },
  evaluate: {
    title: "See how well each job fits",
    help: "We compare every job with your résumé.",
    doneText: (o) => `Done — ${o.evaluate.count} checked`,
  },
};

const ORDER: DashboardStep[] = ["profile", "scan", "evaluate"];

type StepStatus = "done" | "current" | "todo" | "locked";

/** Which step a running pipeline command belongs to. */
function runningStep(running: PipelineCommand | null): DashboardStep | null {
  if (!running) return null;
  if (running === "scan" || running === "scan:fallback") return "scan";
  if (running.startsWith("evaluate")) return "evaluate";
  return null;
}

interface StepView {
  key: DashboardStep;
  index: number;
  status: StepStatus;
  done: boolean;
  lockedReason: string | null;
  busy: boolean;
}

function buildSteps(o: OnboardingState, running: PipelineCommand | null): StepView[] {
  const active = runningStep(running);
  // The backend's "keywords" gate (Job Matching prefs) has no dashboard
  // surface of its own anymore — it's folded into "profile", so the profile
  // step isn't done (and is the one the user should act on) until both are.
  const uiNextStep = o.nextStep === "keywords" ? "profile" : o.nextStep;

  return ORDER.map((key, index) => {
    const done = key === "profile" ? o.profile.done && o.keywords.done : o[key].done;

    let locked = false;
    let lockedReason: string | null = null;
    if (key === "scan" && !done && (!o.profile.done || !o.keywords.done)) {
      locked = true;
      lockedReason = "Available after step 1";
    } else if (key === "evaluate") {
      if (!o.profile.done || !o.keywords.done) {
        locked = true;
        lockedReason = "Available after step 1";
      } else if (!o.scan.done) {
        locked = true;
        lockedReason = "Available after step 2";
      }
    }

    let status: StepStatus;
    if (done) status = "done";
    else if (locked) status = "locked";
    else if (uiNextStep === key) status = "current";
    else status = "todo";

    return { key, index, status, done, lockedReason, busy: active === key };
  });
}

/** Step marker: number, check (done) or lock — always with words beside it. */
function StepMarker({ step }: { step: StepView }) {
  const base = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold";
  if (step.status === "done") {
    return (
      <span className={`${base} bg-primary text-primary-foreground`} aria-hidden="true">
        <Icon icon={Check} size="md" />
      </span>
    );
  }
  if (step.status === "locked") {
    return (
      <span className={`${base} border border-input text-muted-foreground`} aria-hidden="true">
        <Icon icon={Lock} size="sm" />
      </span>
    );
  }
  return (
    <span
      className={`${base} border-2 ${step.status === "current" ? "border-primary text-primary" : "border-input text-muted-foreground"}`}
      aria-hidden="true"
    >
      {step.index + 1}
    </span>
  );
}

/** Live progress plus the way out, while a search or fit check runs. */
function RunningCard({
  running,
  percent,
  progressLabel,
  onStop,
}: {
  running: PipelineCommand;
  percent: number | null;
  progressLabel: string | null;
  onStop: () => void;
}) {
  const searching = runningStep(running) === "scan";
  const title = searching ? "Looking for new jobs…" : "Checking how well each job fits…";
  return (
    <Card padding={6}>
      <VStack gap={4}>
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <VStack gap={1} className="min-w-0 flex-1 basis-72">
            <Heading level={2}>{title}</Heading>
            <Text color="secondary">
              {searching
                ? "When the search is done, we'll check how well each new job fits you."
                : progressLabel
                  ? `${progressLabel}.`
                  : "This usually takes a few minutes."}{" "}
              You can leave this page — we&apos;ll keep working.
            </Text>
          </VStack>
          <Button label="Stop" variant="secondary" icon={<Icon icon={Square} />} onClick={onStop} />
        </HStack>
        <ProgressBar label={title} isLabelHidden value={percent ?? 0} isIndeterminate={percent === null} />
      </VStack>
    </Card>
  );
}

// The highest score we've already celebrated for this user, persisted so the
// "new best match" message shows once per new personal best (a re-scan that
// surfaces a stronger role shows it again) rather than on every load.
const REVEAL_KEY = "careerops:reveal-topscore";

export function LaunchPad({
  onboarding,
  loading,
  running,
  percent,
  progressLabel,
  onFindJobs,
  onCheckJobs,
  onStop,
  bestJob,
  onShowJob,
}: LaunchPadProps) {
  // Read after mount (not in the state initializer) so the server and first
  // client render agree — avoids a hydration mismatch flashing the wrong card.
  const [seenScore, setSeenScore] = React.useState<number | null | undefined>(undefined);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REVEAL_KEY);
      setSeenScore(raw == null ? null : Number(raw));
    } catch {
      setSeenScore(null);
    }
  }, []);

  if (!onboarding || seenScore === undefined) {
    if (!loading && onboarding === null) return null;
    return (
      <Card padding={6}>
        <VStack gap={3}>
          <Skeleton height={28} width="45%" />
          <Skeleton height={20} width="70%" />
          <Skeleton height={56} width={200} />
        </VStack>
      </Card>
    );
  }

  const steps = buildSteps(onboarding, running);
  const busyAny = running !== null;
  const strong = onboarding.evaluate.strong;
  const unchecked = Math.max(0, onboarding.scan.count - onboarding.evaluate.count);
  const hasNewBest =
    onboarding.topScore != null && (seenScore == null || onboarding.topScore > seenScore);

  const rememberBest = () => {
    if (onboarding.topScore != null) {
      try {
        window.localStorage.setItem(REVEAL_KEY, String(onboarding.topScore));
      } catch {
        /* storage unavailable — the message just shows again next time */
      }
    }
    setSeenScore(onboarding.topScore);
  };

  // ── Set up: one calm card with the one thing to do next. ──
  if (onboarding.complete) {
    if (running) {
      return <RunningCard running={running} percent={percent} progressLabel={progressLabel} onStop={onStop} />;
    }

    // A new best match: name the job and take them straight to it. The job
    // itself is in the list below (marked "Your best match"), so this card
    // only points at it rather than showing it a second time.
    if (hasNewBest && bestJob && strong > 0) {
      const others = Math.max(0, strong - 1);
      const match = matchText(bestJob.score);
      return (
        <Card padding={6}>
          <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={1} className="min-w-0 flex-1 basis-72">
              <Heading level={2}>You have a new best match</Heading>
              <Text>
                <Text weight="semibold">{bestJob.role}</Text> at {bestJob.company}
                {match && bestJob.score != null
                  ? ` — ${match.label.toLowerCase()}, ${bestJob.score.toFixed(1)} out of 5.`
                  : "."}
              </Text>
              {others > 0 && (
                <Text color="secondary">
                  Plus {others} more good match{others === 1 ? "" : "es"} in your list.
                </Text>
              )}
            </VStack>
            <Button
              label="Show me this job"
              variant="primary"
              size="lg"
              endContent={<Icon icon={ArrowDown} />}
              onClick={() => {
                rememberBest();
                onShowJob(bestJob.num);
              }}
            />
          </HStack>
        </Card>
      );
    }

    // Nothing cleared the bar: say so kindly and offer the fix, never a dead end.
    if (strong === 0) {
      return (
        <Card padding={6}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={2}>No strong matches yet</Heading>
              <Text color="secondary" className="max-w-[40rem]">
                We checked {onboarding.scan.count} job{onboarding.scan.count === 1 ? "" : "s"}, but none fit
                you well enough to recommend. Adding more places you&apos;d work — or allowing remote jobs —
                usually helps.
              </Text>
            </VStack>
            <HStack gap={3} wrap="wrap">
              <Button
                label="Add more cities or allow remote jobs"
                href="/profile?from=nomatch#section-matching"
                variant="primary"
                size="lg"
                icon={<Icon icon={MapPin} />}
              />
              <Button
                label="Find new jobs"
                variant="secondary"
                size="lg"
                icon={<Icon icon={Search} />}
                onClick={onFindJobs}
              />
            </HStack>
          </VStack>
        </Card>
      );
    }

    // Some jobs were found but not checked yet (e.g. a search finished while away).
    if (unchecked > 0) {
      return (
        <Card padding={6}>
          <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={1} className="min-w-0 flex-1 basis-72">
              <Heading level={2}>
                {unchecked} job{unchecked === 1 ? " isn't" : "s aren't"} checked yet
              </Heading>
              <Text color="secondary">
                We&apos;ll compare {unchecked === 1 ? "it" : "them"} with your résumé.
              </Text>
            </VStack>
            <Button
              label={unchecked === 1 ? "Check it now" : "Check them now"}
              variant="primary"
              size="lg"
              icon={<Icon icon={ListChecks} />}
              onClick={onCheckJobs}
            />
          </HStack>
        </Card>
      );
    }

    // Everyday state: the one thing to do next.
    return (
      <Card padding={6}>
        <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
          <VStack gap={1} className="min-w-0 flex-1 basis-72">
            <Heading level={2}>Look for new jobs</Heading>
            <Text color="secondary">
              New jobs are posted every day. We&apos;ll check how well each one fits you.
            </Text>
          </VStack>
          <Button
            label="Find new jobs"
            variant="primary"
            size="lg"
            icon={<Icon icon={Search} />}
            onClick={onFindJobs}
          />
        </HStack>
      </Card>
    );
  }

  // ── Setting up: three numbered steps, only the next one is highlighted. ──
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <Card padding={6}>
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={2}>Get set up in three steps</Heading>
          <Text color="secondary">
            {doneCount} of {steps.length} done
          </Text>
        </VStack>

        <VStack as="ol" gap={0}>
          {steps.map((step) => (
            <li
              key={step.key}
              className="flex flex-wrap items-center gap-4 border-t border-border py-5 first:border-t-0 first:pt-0"
            >
              <StepMarker step={step} />
              <VStack gap={0.5} className="min-w-0 flex-1 basis-56">
                <Text weight="semibold" color={step.status === "locked" ? "secondary" : "primary"}>
                  {COPY[step.key].title}
                </Text>
                <Text color="secondary">
                  {step.done
                    ? COPY[step.key].doneText(onboarding)
                    : step.status === "locked"
                      ? step.lockedReason
                      : COPY[step.key].help}
                </Text>
              </VStack>
              <StepAction step={step} busyAny={busyAny} onFindJobs={onFindJobs} onCheckJobs={onCheckJobs} />
            </li>
          ))}
        </VStack>

        {running && (
          <ProgressBar
            label={runningStep(running) === "scan" ? "Looking for jobs…" : "Checking how well each job fits…"}
            value={percent ?? 0}
            isIndeterminate={percent === null}
          />
        )}
      </VStack>
    </Card>
  );
}

function StepAction({
  step,
  busyAny,
  onFindJobs,
  onCheckJobs,
}: {
  step: StepView;
  busyAny: boolean;
  onFindJobs: () => void;
  onCheckJobs: () => void;
}) {
  if (step.status === "locked") return null;
  const primary = step.status === "current";
  const variant = primary ? "primary" : "secondary";
  const size = primary ? "lg" : "md";

  // Profile (which also covers job search settings) is a navigation; the rest
  // are in-place actions.
  if (step.key === "profile") {
    return (
      <Button
        label={step.done ? "Edit profile" : "Set up my profile"}
        href="/profile"
        variant={variant}
        size={size}
        endContent={primary ? <Icon icon={ArrowRight} /> : undefined}
      />
    );
  }

  const isScan = step.key === "scan";
  return (
    <Button
      label={
        step.busy
          ? isScan
            ? "Looking for jobs…"
            : "Checking…"
          : isScan
            ? step.done
              ? "Find new jobs"
              : "Find jobs"
            : "Check how well they fit"
      }
      variant={variant}
      size={size}
      icon={<Icon icon={isScan ? Search : ListChecks} />}
      isLoading={step.busy}
      isDisabled={busyAny && !step.busy}
      onClick={isScan ? onFindJobs : onCheckJobs}
    />
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Lock,
  MapPin,
  PartyPopper,
  Pencil,
  Radar,
  RotateCw,
  Sparkles,
  Tags,
  UserRound,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Confetti } from "@/components/ui/confetti";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { OnboardingState, OnboardingStep } from "@/lib/types";
import type { PipelineCommand } from "@/lib/pipeline";

interface LaunchPadProps {
  onboarding: OnboardingState | null;
  loading: boolean;
  /** The pipeline command currently running, if any. */
  running: PipelineCommand | null;
  /** 0–100 live progress for the current run, or null before telemetry
   * exists. Only ever rendered when `onboarding.complete` — pre-completion
   * runs keep the plain spinner. */
  percent: number | null;
  progressLabel: string | null;
  onOpenKeywords: () => void;
  onRun: (command: PipelineCommand) => void;
}

const ICONS: Record<OnboardingStep, React.ComponentType<{ className?: string }>> = {
  profile: UserRound,
  keywords: Tags,
  scan: Radar,
  evaluate: Sparkles,
};

const COPY: Record<OnboardingStep, { title: string; help: string }> = {
  profile: { title: "Add your profile", help: "Upload your résumé — we fill in the rest." },
  keywords: { title: "Pick target roles", help: "Add keywords so we scan the right titles." },
  scan: { title: "Find open roles", help: "Search job boards for roles that match." },
  evaluate: { title: "Score your matches", help: "Rate each role against your CV." },
};

const ORDER: OnboardingStep[] = ["profile", "keywords", "scan", "evaluate"];

type StepStatus = "done" | "current" | "todo" | "locked";

/** Which step a running pipeline command belongs to. */
function runningStep(running: PipelineCommand | null): OnboardingStep | null {
  if (!running) return null;
  if (running === "scan" || running === "scan:fallback") return "scan";
  if (running.startsWith("evaluate")) return "evaluate";
  return null;
}

/**
 * Live percent bar for a post-onboarding re-run, reusing the same
 * brand-gradient bar onboarding's goal-gradient bar uses
 * (onboarding-flow.tsx:630-635) for visual consistency. Self-suppresses
 * (renders nothing) until real per-item telemetry exists, so callers don't
 * need their own null-guards beyond "is something running".
 */
function RunProgress({
  percent,
  progressLabel,
}: {
  percent: number | null;
  progressLabel: string | null;
}) {
  if (percent === null || progressLabel === null) return null;
  return (
    <div className="mt-1.5 max-w-[220px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="brand-gradient h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[0.68rem] text-muted-foreground",
          percent >= 80 && "font-medium text-primary",
        )}
      >
        {progressLabel} · {percent}%
      </p>
    </div>
  );
}

interface StepView {
  key: OnboardingStep;
  index: number;
  status: StepStatus;
  done: boolean;
  summary: string | null;
  lockedReason: string | null;
  ctaLabel: string;
  busy: boolean;
}

function buildSteps(o: OnboardingState, running: PipelineCommand | null): StepView[] {
  const active = runningStep(running);

  return ORDER.map((key, index) => {
    const done = o[key].done;

    let locked = false;
    let lockedReason: string | null = null;
    if (key === "scan" && !o.keywords.done) {
      locked = true;
      lockedReason = "Add a keyword first";
    } else if (key === "evaluate") {
      if (!o.profile.done) {
        locked = true;
        lockedReason = "Complete your profile first";
      } else if (!o.scan.done) {
        locked = true;
        lockedReason = "Find roles with a scan first";
      }
    }

    let status: StepStatus;
    if (done) status = "done";
    else if (locked) status = "locked";
    else if (o.nextStep === key) status = "current";
    else status = "todo";

    let summary: string | null = null;
    if (done) {
      if (key === "profile") summary = "Ready";
      else if (key === "keywords") summary = `${o.keywords.count} keyword${o.keywords.count === 1 ? "" : "s"}`;
      else if (key === "scan") summary = `${o.scan.count} role${o.scan.count === 1 ? "" : "s"}`;
      else summary = `${o.evaluate.count} scored`;
    }

    const ctaLabel =
      key === "profile"
        ? done
          ? "Edit"
          : "Set up profile"
        : key === "keywords"
          ? done
            ? "Edit"
            : "Add keywords"
          : key === "scan"
            ? done
              ? "Scan again"
              : "Run scan"
            : done
              ? "Evaluate again"
              : "Evaluate roles";

    return {
      key,
      index,
      status,
      done,
      summary,
      lockedReason,
      ctaLabel,
      busy: active === key,
    };
  });
}

function Indicator({ step }: { step: StepView }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold";
  if (step.busy) {
    return (
      <span className={cn(base, "bg-primary/15 text-primary")}>
        <Spinner className="h-4 w-4" />
      </span>
    );
  }
  if (step.status === "done") {
    return (
      <span className={cn(base, "bg-ctp-green/20 text-ctp-green")}>
        <Check className="h-4 w-4" />
      </span>
    );
  }
  if (step.status === "locked") {
    return (
      <span className={cn(base, "border border-border text-muted-foreground")}>
        <Lock className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (step.status === "current") {
    return <span className={cn(base, "brand-gradient text-white")}>{step.index + 1}</span>;
  }
  return <span className={cn(base, "border border-border text-muted-foreground")}>{step.index + 1}</span>;
}

function StepAction({
  step,
  busyAny,
  onOpenKeywords,
  onRun,
}: {
  step: StepView;
  busyAny: boolean;
  onOpenKeywords: () => void;
  onRun: (command: PipelineCommand) => void;
}) {
  // Locked steps explain why instead of offering an action.
  if (step.status === "locked") {
    return (
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex" title={step.lockedReason ?? undefined}>
        <Lock className="h-3 w-3" /> {step.lockedReason}
      </span>
    );
  }

  const primary = step.status === "current";
  // The leading glyph for each step's button (re-run steps get a refresh arrow).
  const StepIcon =
    step.key === "profile"
      ? Pencil
      : step.key === "keywords"
        ? Tags
        : step.done
          ? RotateCw
          : step.key === "scan"
            ? Radar
            : Sparkles;
  const icon = <StepIcon className="h-3.5 w-3.5" />;

  // Profile is a navigation; everything else is an in-place action.
  if (step.key === "profile") {
    return (
      <Link
        href="/profile"
        className={cn(
          buttonVariants({ variant: primary ? "default" : step.done ? "ghost" : "outline", size: "sm" }),
        )}
      >
        {step.done ? icon : null}
        {step.ctaLabel}
        {primary && <ArrowRight className="h-3.5 w-3.5" />}
      </Link>
    );
  }

  const onClick =
    step.key === "keywords"
      ? onOpenKeywords
      : step.key === "scan"
        ? () => onRun("scan:fallback")
        : () => onRun("evaluate:all");

  const isPipeline = step.key === "scan" || step.key === "evaluate";
  const disabled = isPipeline && (busyAny || step.busy);

  return (
    <Button
      variant={primary ? "default" : step.done ? "ghost" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
    >
      {step.busy ? <Spinner className="h-3.5 w-3.5" /> : icon}
      {step.busy ? (step.key === "scan" ? "Scanning…" : "Evaluating…") : step.ctaLabel}
      {primary && !step.busy && <ArrowRight className="h-3.5 w-3.5" />}
    </Button>
  );
}

// The highest score we've already celebrated for this user, persisted so the
// reveal fires once per new personal best (a re-scan that surfaces a stronger
// role re-triggers it) rather than on every dashboard load.
const REVEAL_KEY = "careerops:reveal-topscore";

/** Ease-out count-up from 0 → target over `duration` ms. The reward animation. */
function useCountUp(target: number | null, duration = 800): number {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    if (target == null) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function LaunchPad({
  onboarding,
  loading,
  running,
  percent,
  progressLabel,
  onOpenKeywords,
  onRun,
}: LaunchPadProps) {
  const [open, setOpen] = React.useState(false);
  // Read synchronously on the client (LaunchPad only renders after the
  // dashboard's client-side onboarding fetch, so `window` is always defined
  // here — the guard just keeps any SSR path safe).
  const [seenScore, setSeenScore] = React.useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(REVEAL_KEY);
    return raw == null ? null : Number(raw);
  });
  // Hooks must run unconditionally, so drive the count-up before any early
  // return; it's only rendered in the reveal branch below.
  const revealScore = useCountUp(onboarding?.topScore ?? null);

  if (!onboarding) {
    if (!loading) return null;
    return (
      <Card className="p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </Card>
    );
  }

  const steps = buildSteps(onboarding, running);
  const doneCount = steps.filter((s) => s.done).length;
  const busyAny = running !== null;
  const strong = onboarding.evaluate.strong;
  // A strong match we haven't celebrated yet — fires once per new personal best.
  const hasNewBest =
    onboarding.topScore != null && (seenScore == null || onboarding.topScore > seenScore);

  const dismissReveal = () => {
    if (onboarding.topScore != null && typeof window !== "undefined") {
      window.localStorage.setItem(REVEAL_KEY, String(onboarding.topScore));
    }
    setSeenScore(onboarding.topScore);
  };

  // ── Complete + collapsed: reframe / reveal / steady state (in priority order). ──
  if (onboarding.complete && !open) {
    // R5 — Weak-scan reframe: setup is done, but nothing cleared the bar.
    // For a career-switcher, "0 matches" reads as "I'm unqualified" — so frame
    // the empty result as the product doing its job (screening out noise), and
    // always offer a way to widen the net rather than a dead end.
    if (strong === 0) {
      return (
        <Card className="animate-fade-in-up p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ctp-yellow/20">
                <Radar className="h-5 w-5 text-ctp-yellow" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Nothing cleared your bar yet — and that&apos;s the point.</p>
                <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
                  We screened {onboarding.scan.count} role{onboarding.scan.count === 1 ? "" : "s"}; none were
                  strong matches. We&apos;d rather show you zero great roles than a pile of mediocre ones —
                  widen the net and we&apos;ll keep looking.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Show setup steps">
              <ChevronDown className="h-4 w-4" /> Steps
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/profile" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
              <MapPin className="h-3.5 w-3.5" /> Widen locations
            </Link>
            <Button variant="outline" size="sm" onClick={onOpenKeywords}>
              <Tags className="h-3.5 w-3.5" /> Adjust keywords
            </Button>
            <Button variant="outline" size="sm" onClick={() => onRun("scan:fallback")} disabled={busyAny}>
              {runningStep(running) === "scan" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
              Scan again
            </Button>
          </div>
          <RunProgress percent={percent} progressLabel={progressLabel} />
        </Card>
      );
    }

    // R4 — Reveal payoff: end the activation flow on a peak, not a to-do list.
    // The score counts up from 0 as the dopamine hit. (A real social-proof line
    // — "beats X% of applicants for roles like this" — belongs here too, but is
    // gated on a benchmark data source that doesn't exist yet; omitted rather
    // than faked.)
    if (hasNewBest) {
      const top = onboarding.topScore as number;
      return (
        <Card className="animate-fade-in-up overflow-hidden p-5">
          <Confetti fire count={70} />
          <div className="flex flex-wrap items-center gap-4">
            <div className="brand-gradient flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white">
              <span className="text-xl font-bold tabular-nums leading-none">{revealScore.toFixed(1)}</span>
              <span className="text-[10px] font-medium opacity-80">/ 5</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <PartyPopper className="h-4 w-4 text-primary" />
                <p className="font-display text-sm font-semibold">
                  We found {strong} role{strong === 1 ? "" : "s"} that fit you.
                </p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your top match scores {top.toFixed(1)}/5. Take a look — the rest are in your pipeline below.
              </p>
            </div>
            <Button size="sm" onClick={dismissReveal} className="shrink-0">
              See my matches <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      );
    }

    // Steady state: everything's set up → slim status strip.
    return (
      <Card className="animate-fade-in-up p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ctp-green/20">
              <CheckCircle2 className="h-5 w-5 text-ctp-green" />
            </span>
            <div>
              <p className="text-sm font-semibold">You&apos;re all set</p>
              <p className="text-xs text-muted-foreground">
                {onboarding.scan.count} roles · {onboarding.evaluate.count} scored · re-run anytime
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onRun("scan:fallback")} disabled={busyAny}>
              {runningStep(running) === "scan" ? <Spinner className="h-3.5 w-3.5" /> : <Radar className="h-3.5 w-3.5" />}
              Scan
            </Button>
            <Button variant="outline" size="sm" onClick={() => onRun("evaluate:all")} disabled={busyAny}>
              {runningStep(running) === "evaluate" ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              Evaluate
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenKeywords}>
              <Tags className="h-3.5 w-3.5" /> Keywords
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Show setup steps">
              <ChevronDown className="h-4 w-4" /> Steps
            </Button>
          </div>
        </div>
        <RunProgress percent={percent} progressLabel={progressLabel} />
      </Card>
    );
  }

  // ── Activation state: guided checklist with a single highlighted next step. ──
  const headline = onboarding.complete
    ? "Setup complete"
    : onboarding.nextStep === "profile"
      ? "Let's set up your job search"
      : "Finish setup to see your matches";

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <div>
            <h2 className="font-display text-sm font-semibold">{headline}</h2>
            <p className="text-xs text-muted-foreground">
              {onboarding.complete
                ? "Re-run any step, or collapse this panel."
                : "Do the highlighted step next — the rest unlock as you go."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="brand-gradient h-full rounded-full transition-all duration-500"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {doneCount}/{steps.length}
            </span>
          </div>
          {onboarding.complete && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} title="Collapse">
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {steps.map((step) => {
          const Icon = ICONS[step.key];
          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                step.status === "current"
                  ? "border-primary/40 bg-primary/5 shadow-[0_0_24px_-12px_hsl(var(--brand-to)/0.6)]"
                  : "border-transparent",
                step.status === "locked" && "opacity-60",
              )}
            >
              <Indicator step={step} />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", step.done ? "text-ctp-green" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{COPY[step.key].title}</span>
                    {step.summary && <span className="text-xs text-ctp-green">{step.summary}</span>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {step.status === "locked" ? step.lockedReason : COPY[step.key].help}
                  </p>
                  {onboarding.complete && step.busy && (
                    <RunProgress percent={percent} progressLabel={progressLabel} />
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <StepAction step={step} busyAny={busyAny} onOpenKeywords={onOpenKeywords} onRun={onRun} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

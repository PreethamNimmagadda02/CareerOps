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
  Loader2,
  Lock,
  Pencil,
  Radar,
  RotateCw,
  Sparkles,
  Tags,
  UserRound,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OnboardingState, OnboardingStep } from "@/lib/types";
import type { PipelineCommand } from "@/lib/pipeline";

interface LaunchPadProps {
  onboarding: OnboardingState | null;
  loading: boolean;
  /** The pipeline command currently running, if any. */
  running: PipelineCommand | null;
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
        <Loader2 className="h-4 w-4 animate-spin" />
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
    return <span className={cn(base, "bg-primary text-primary-foreground")}>{step.index + 1}</span>;
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
      {step.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {step.busy ? (step.key === "scan" ? "Scanning…" : "Evaluating…") : step.ctaLabel}
      {primary && !step.busy && <ArrowRight className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function LaunchPad({ onboarding, loading, running, onOpenKeywords, onRun }: LaunchPadProps) {
  const [open, setOpen] = React.useState(false);

  if (!onboarding) {
    if (!loading) return null;
    return (
      <Card className="animate-pulse p-5">
        <div className="mb-4 h-4 w-40 rounded bg-muted" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/60" />
          ))}
        </div>
      </Card>
    );
  }

  const steps = buildSteps(onboarding, running);
  const doneCount = steps.filter((s) => s.done).length;
  const busyAny = running !== null;
  const collapsed = onboarding.complete && !open;

  // ── Steady state: everything's set up → slim status strip. ──
  if (collapsed) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
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
            {runningStep(running) === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            Scan
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRun("evaluate:all")} disabled={busyAny}>
            {runningStep(running) === "evaluate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Evaluate
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenKeywords}>
            <Tags className="h-3.5 w-3.5" /> Keywords
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Show setup steps">
            <ChevronDown className="h-4 w-4" /> Steps
          </Button>
        </div>
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
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">{headline}</h2>
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
                className="h-full rounded-full bg-primary transition-all duration-500"
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
                  ? "border-primary/40 bg-primary/5"
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

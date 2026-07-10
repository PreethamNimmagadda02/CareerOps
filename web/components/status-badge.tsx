import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/status";

const STATUS_STYLES: Record<string, string> = {
  interview: "bg-ctp-green/15 text-ctp-green",
  offer: "bg-ctp-green/15 text-ctp-green",
  applied: "bg-ctp-sky/15 text-ctp-sky",
  responded: "bg-ctp-blue/15 text-ctp-blue",
  evaluated: "bg-muted text-muted-foreground",
  skip: "bg-ctp-red/15 text-ctp-red",
  rejected: "bg-muted text-muted-foreground/70",
  discarded: "bg-muted text-muted-foreground/70",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        style,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

/** Verdict chip styles — the evaluation's bottom line, scannable at a glance. */
const RECOMMENDATION_STYLES: Record<string, { label: string; className: string }> = {
  APPLY_NOW: {
    label: "Apply now",
    className: "bg-ctp-green/20 text-ctp-green ring-1 ring-inset ring-ctp-green/40",
  },
  APPLY_WITH_TWEAKS: {
    label: "Tweak & apply",
    className: "bg-ctp-yellow/15 text-ctp-yellow ring-1 ring-inset ring-ctp-yellow/30",
  },
  MONITOR: {
    label: "Monitor",
    className: "bg-ctp-sky/10 text-ctp-sky ring-1 ring-inset ring-ctp-sky/25",
  },
  SKIP: {
    label: "Skip",
    className: "bg-ctp-red/10 text-ctp-red/90 ring-1 ring-inset ring-ctp-red/25",
  },
};

/**
 * The evaluation verdict (APPLY NOW / TWEAK & APPLY / MONITOR / SKIP) as a
 * pill. Answers "what should I do with this role?" without opening the report.
 */
export function RecommendationBadge({ recommendation }: { recommendation: string | null | undefined }) {
  if (!recommendation) return <span className="text-xs text-muted-foreground">—</span>;
  const style = RECOMMENDATION_STYLES[recommendation];
  if (!style) return <span className="text-xs text-muted-foreground">{recommendation}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

/** A compact, tonal pill for a role's numeric score — easier to scan than plain text. */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const tone =
    score >= 4.0
      ? "bg-ctp-green/15 text-ctp-green"
      : score >= 3.8
        ? "bg-ctp-yellow/15 text-ctp-yellow"
        : score >= 3.0
          ? "bg-muted text-foreground"
          : "bg-ctp-red/15 text-ctp-red";
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        tone,
      )}
    >
      {score.toFixed(1)}
    </span>
  );
}

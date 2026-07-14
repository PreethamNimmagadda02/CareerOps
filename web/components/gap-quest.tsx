"use client";

import * as React from "react";
import { AlertTriangle, ArrowUpRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Turns a role's blocking gaps into an interactive quest (Commitment + the
 * Zeigarnik open loop). Checking a gap is a planning aid — we NEVER fake the
 * score. When every gap is ticked we show a clearly-labelled *projection* and
 * point the user at their CV; the real re-score happens on the next scan.
 */
export function GapQuest({
  gaps,
  currentScore,
  strongThreshold = 4,
}: {
  gaps: string[];
  currentScore: number | null;
  strongThreshold?: number;
}) {
  const [done, setDone] = React.useState<boolean[]>(() => gaps.map(() => false));
  const fixedCount = done.filter(Boolean).length;
  const allFixed = fixedCount === gaps.length && gaps.length > 0;

  // A conservative, transparent estimate — not a recomputation. We only ever
  // claim "likely" and tell the user the true re-score is on the next scan.
  const projected =
    currentScore == null
      ? null
      : Math.min(5, currentScore + (gaps.length ? (fixedCount / gaps.length) * 0.6 : 0));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ctp-yellow">
          <AlertTriangle className="h-3.5 w-3.5" /> Close the gaps
        </p>
        <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
          {fixedCount}/{gaps.length} addressed
        </span>
      </div>

      <ul className="space-y-1.5">
        {gaps.map((gap, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
              aria-pressed={done[i]}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                done[i]
                  ? "border-transparent bg-ctp-green/10 text-muted-foreground line-through"
                  : "border-border hover:border-border/80",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  done[i] ? "border-ctp-green bg-ctp-green text-white" : "border-muted-foreground/40",
                )}
              >
                {done[i] && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span>{gap}</span>
            </button>
          </li>
        ))}
      </ul>

      {fixedCount > 0 && projected != null && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Projected after these edits</span>
          <span className="font-mono font-bold tabular-nums text-primary">~{projected.toFixed(1)}/5</span>
          {allFixed && projected >= strongThreshold && (
            <span className="rounded bg-ctp-green/15 px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-ctp-green">
              likely APPLY_NOW
            </span>
          )}
          <a
            href="/profile"
            className="ml-auto inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            Update my CV <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      )}
      {allFixed && (
        <p className="mt-1.5 font-mono text-[0.62rem] text-muted-foreground">
          estimate only — we re-score this role for real on your next scan
        </p>
      )}
    </div>
  );
}

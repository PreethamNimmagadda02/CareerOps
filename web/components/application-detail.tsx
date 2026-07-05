import { AlertTriangle, Banknote, Globe2, Quote, Tag } from "lucide-react";

import { RecommendationBadge } from "@/components/status-badge";
import type { Application, ScoreDimensionView } from "@/lib/types";
import { cn } from "@/lib/utils";

function barTone(score: number): string {
  if (score >= 4) return "bg-ctp-green";
  if (score >= 3) return "bg-ctp-yellow";
  return "bg-ctp-red";
}

/** Horizontal 1–5 bars for the five scored dimensions behind the overall score. */
function ScoreBreakdown({ dimensions }: { dimensions: ScoreDimensionView[] }) {
  return (
    <div className="space-y-2">
      {dimensions.map((d) => (
        <div key={d.key} title={d.reason}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {d.label}{" "}
              <span className="text-muted-foreground/50">{Math.round(d.weight * 100)}%</span>
            </span>
            <span className="font-semibold tabular-nums">{d.score}/5</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", barTone(d.score))}
              style={{ width: `${(d.score / 5) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetaChip({
  icon: Icon,
  children,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs text-muted-foreground"
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground/60" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Row-expansion panel: everything the evaluation learned about a role —
 * verdict + rationale, TL;DR, blocking gaps, dimension scores, and meta —
 * without opening the full report.
 */
export function ApplicationInsights({ app }: { app: Application }) {
  const hasDims = (app.dimensions?.length ?? 0) > 0;
  const hasGaps = (app.gaps?.length ?? 0) > 0;
  const hasAnything =
    hasDims || hasGaps || app.tldr || app.recommendation || app.comp || app.archetype;

  if (!hasAnything) {
    return (
      <p className="py-1 text-sm text-muted-foreground">
        No parsed insights for this role yet — open the report for the full evaluation, or run{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run db:backfill-insights</code>.
      </p>
    );
  }

  return (
    <div className="grid gap-x-8 gap-y-4 py-1 md:grid-cols-[1.2fr_1fr]">
      <div className="min-w-0 space-y-3.5">
        {/* Verdict + rationale */}
        {app.recommendation && (
          <div className="flex flex-wrap items-center gap-2">
            <RecommendationBadge recommendation={app.recommendation} />
            {app.recommendationNote && (
              <span className="text-sm text-muted-foreground">{app.recommendationNote}</span>
            )}
          </div>
        )}

        {/* TL;DR */}
        {app.tldr && (
          <div className="flex gap-2">
            <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <p className="text-sm leading-relaxed text-foreground/90">{app.tldr}</p>
          </div>
        )}

        {/* Blocking gaps */}
        {hasGaps && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ctp-yellow">
              <AlertTriangle className="h-3.5 w-3.5" /> Gaps to address
            </p>
            <ul className="space-y-1">
              {app.gaps!.map((gap, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-ctp-yellow/70" />
                  {gap}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Meta chips */}
        <div className="flex flex-wrap gap-1.5">
          {app.archetype && <MetaChip icon={Tag}>{app.archetype}</MetaChip>}
          {app.remote && (
            <MetaChip icon={Globe2} title={app.remote}>
              {app.remote}
            </MetaChip>
          )}
          {app.comp && (
            <MetaChip icon={Banknote} title={app.comp}>
              {app.comp}
            </MetaChip>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      {hasDims && (
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Why this score
          </p>
          <ScoreBreakdown dimensions={app.dimensions!} />
        </div>
      )}
    </div>
  );
}

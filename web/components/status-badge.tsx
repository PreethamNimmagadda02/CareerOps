"use client";

import {
  CalendarCheck,
  Circle,
  CircleCheck,
  CircleDot,
  CircleMinus,
  CircleSlash,
  Clock,
  MessageCircle,
  Send,
  ThumbsUp,
  Trophy,
} from "lucide-react";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";

import { cn } from "@/lib/utils";
import { ADVICE_TEXT, matchText, statusText } from "@/lib/labels";

/**
 * Every state below carries color + icon + a word, never color alone —
 * readable for color-blind users, in grayscale, and at a glance.
 */

// ── Fit meter: the product's signature ───────────────────────────────────────

/**
 * How well a job fits, as five dots plus the number and a word:
 * ●●●●◐ 4.6 · Great match. Dots fill fractionally (4.6 → four and a bit),
 * read without color, and look the same everywhere a score appears.
 */
export function FitMeter({
  score,
  size = "md",
  showLabel = true,
}: {
  score: number | null;
  size?: "md" | "lg";
  showLabel?: boolean;
}) {
  const match = matchText(score);
  if (score === null || !match) {
    return (
      <Text weight="semibold" color="secondary">
        Not checked yet
      </Text>
    );
  }
  const great = score >= 4;
  const dot = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <HStack
      gap={2}
      vAlign="center"
      wrap="wrap"
      role="img"
      aria-label={`Fit ${score.toFixed(1)} out of 5, ${match.label}`}
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => {
          const fill = Math.max(0, Math.min(1, score - i));
          return (
            // The empty part of a dot is an outlined ring, so an unfilled dot
            // still reads as "a dot" on both light and dark cards.
            <span
              key={i}
              className={cn(
                "relative overflow-hidden rounded-full bg-foreground/10 ring-1 ring-inset ring-foreground/35",
                dot,
              )}
            >
              <span
                className={cn("absolute inset-y-0 left-0", great ? "bg-primary" : "bg-foreground/70")}
                style={{ width: `${fill * 100}%` }}
              />
            </span>
          );
        })}
      </span>
      <span aria-hidden="true" className="flex items-baseline gap-1.5">
        <Text size={size === "lg" ? "3xl" : "2xl"} weight="bold" hasTabularNumbers>
          {score.toFixed(1)}
        </Text>
        {showLabel && (
          <Text weight="semibold" color={great ? "accent" : "secondary"}>
            {match.label}
          </Text>
        )}
      </span>
    </HStack>
  );
}

// ── Where you are with a job ─────────────────────────────────────────────────

const STATUS_ICON: Record<string, typeof Circle> = {
  evaluated: Circle,
  applied: Send,
  responded: MessageCircle,
  interview: CalendarCheck,
  offer: Trophy,
  rejected: CircleSlash,
  discarded: CircleMinus,
  skip: CircleMinus,
};

/** Tinted, never filled: a status must not look like a button or outshine the fit. */
const PILL_TONE: Record<string, string> = {
  success: "bg-primary/10 ring-primary/35",
  info: "bg-info/10 ring-info/35",
  neutral: "bg-foreground/[0.06] ring-border",
  warning: "bg-warning/10 ring-warning/35",
  error: "bg-foreground/[0.06] ring-border",
};

const PILL_ICON_COLOR = {
  success: "accent",
  info: "info",
  neutral: "secondary",
  warning: "warning",
  error: "error",
} as const;

/** Classes shared by the status pill and the dashboard's "change status" trigger. */
export function statusPillClass(status: string): string {
  return cn(
    "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold text-foreground ring-1 ring-inset",
    PILL_TONE[statusText(status).tone],
  );
}

/** The icon and word for a stage — the inside of a status pill. */
export function StatusPillContent({ status }: { status: string }) {
  const { label, tone } = statusText(status);
  return (
    <>
      <Icon icon={STATUS_ICON[status] ?? Circle} size="sm" color={PILL_ICON_COLOR[tone]} />
      {label}
    </>
  );
}

/**
 * Where you are with a job ("Applied", "Interviewing"…): icon + word in one
 * tinted pill shape, the same for every stage.
 */
export function StatusChip({ status }: { status: string }) {
  return (
    <span className={statusPillClass(status)}>
      <StatusPillContent status={status} />
    </span>
  );
}

/** Kept for callers that only need the word with a status tone. */
export function StatusBadge({ status }: { status: string }) {
  return <StatusChip status={status} />;
}

// ── The evaluation's advice ──────────────────────────────────────────────────

const ADVICE_ICON = {
  APPLY_NOW: ThumbsUp,
  APPLY_WITH_TWEAKS: Clock,
  MONITOR: CircleDot,
  SKIP: CircleMinus,
} as const;

const TONE_ICON_COLOR = {
  success: "accent",
  warning: "warning",
  info: "secondary",
  error: "error",
  neutral: "secondary",
} as const;

/**
 * Our advice on a job, written as advice — "Our advice: Apply now" — on a
 * pale strip, so it can't be mistaken for a link, a button, or a decision
 * the person already made.
 */
export function AdviceBadge({
  recommendation,
  hasPrefix = true,
}: {
  recommendation: string | null | undefined;
  /** Show "Our advice:" before the words (on by default). */
  hasPrefix?: boolean;
}) {
  if (!recommendation) return null;
  const advice = ADVICE_TEXT[recommendation];
  const glyph = ADVICE_ICON[recommendation as keyof typeof ADVICE_ICON] ?? CircleCheck;
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md bg-foreground/[0.06] px-3 py-1.5">
      <Icon icon={glyph} size="md" color={advice ? TONE_ICON_COLOR[advice.tone] : "secondary"} />
      <Text>
        {hasPrefix && <Text color="secondary">Our advice: </Text>}
        <Text weight="semibold">{advice?.label ?? recommendation}</Text>
      </Text>
    </span>
  );
}

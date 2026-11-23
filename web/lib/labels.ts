/**
 * Plain-language copy for every status, verdict and score the app shows.
 *
 * One source of truth so the whole product speaks the same simple language —
 * no internal jargon ("evaluated", "APPLY_WITH_TWEAKS", "4.2/5") reaches the
 * screen without a human word next to it. Colors are always paired with an
 * icon and a word, never used alone, so meaning survives color-blindness and
 * grayscale.
 */

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "error";

/**
 * Application status (normalized key → what the user sees). "Skipped" and
 * "Archived" were the same idea to a person, so both read "Not for me"; the
 * stored values are unchanged.
 */
export const STATUS_TEXT: Record<string, { label: string; tone: BadgeTone }> = {
  evaluated: { label: "To review", tone: "neutral" },
  applied: { label: "Applied", tone: "info" },
  responded: { label: "Heard back", tone: "info" },
  interview: { label: "Interviewing", tone: "success" },
  offer: { label: "Offer", tone: "success" },
  rejected: { label: "Not selected", tone: "neutral" },
  discarded: { label: "Not for me", tone: "neutral" },
  skip: { label: "Not for me", tone: "neutral" },
};

export function statusText(norm: string): { label: string; tone: BadgeTone } {
  return (
    STATUS_TEXT[norm] ?? {
      label: norm ? norm.charAt(0).toUpperCase() + norm.slice(1) : "Unknown",
      tone: "neutral",
    }
  );
}

/**
 * The one obvious next step for a job at each stage, as the stored status
 * value it moves to. Closed jobs (offer, not selected, not for me) have none.
 */
export const NEXT_STEP: Record<string, { label: string; to: string } | undefined> = {
  evaluated: { label: "I applied", to: "Applied" },
  applied: { label: "I heard back", to: "Responded" },
  responded: { label: "I have an interview", to: "Interview" },
  interview: { label: "I got an offer", to: "Offer" },
};

/** The full status list, grouped the way a person thinks about it. */
export const STATUS_GROUPS: { title: string; options: { value: string; label: string }[] }[] = [
  {
    title: "Still going",
    options: [
      { value: "Evaluated", label: "To review" },
      { value: "Applied", label: "Applied" },
      { value: "Responded", label: "Heard back" },
      { value: "Interview", label: "Interviewing" },
      { value: "Offer", label: "Offer" },
    ],
  },
  {
    title: "Closed",
    options: [
      { value: "Rejected", label: "Not selected" },
      { value: "SKIP", label: "Not for me" },
    ],
  },
];

/** The evaluation's advice ("what should I do with this job?"). */
export const ADVICE_TEXT: Record<string, { label: string; tone: BadgeTone; hint: string }> = {
  APPLY_NOW: { label: "Apply now", tone: "success", hint: "A strong fit — worth applying soon." },
  APPLY_WITH_TWEAKS: {
    label: "Apply after small edits",
    tone: "warning",
    hint: "A good fit once you tailor your résumé a little.",
  },
  MONITOR: { label: "Maybe later", tone: "info", hint: "Some fit — keep it in mind." },
  SKIP: { label: "Not a fit", tone: "neutral", hint: "Probably not worth your time." },
};

/** Match strength for a 0–5 score, in words. */
export function matchText(score: number | null): { label: string; tone: BadgeTone } | null {
  if (score === null || Number.isNaN(score)) return null;
  if (score >= 4) return { label: "Great match", tone: "success" };
  if (score >= 3.5) return { label: "Good match", tone: "info" };
  if (score >= 3) return { label: "Fair match", tone: "neutral" };
  return { label: "Weak match", tone: "neutral" };
}

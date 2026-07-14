import { cn } from "@/lib/utils";

/** Brand voice — single source of truth for product messaging. */
export const BRAND = {
  name: "CareerOps",
  tagline: "The modern way to land your next role",
  mission:
    "Job hunting and career building, modernized — discover roles that fit, score them against your CV with AI, and run your whole pipeline from one command center.",
} as const;

/**
 * CareerOps logo mark — a "radar lock".
 *
 * A gradient app-tile carrying a radar (concentric rings + centre node) whose
 * sweep line locks onto a glowing matched-role blip, placed up-and-to-the-right
 * to read as career growth. It captures the product's core loop in one glyph:
 * scan the market → find & score the best-fit role → move up. Mirrors the radar
 * used in the onboarding scan step, and matches `app/icon.svg`.
 */
export function Logo({ className, title = "CareerOps" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn("h-8 w-8", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="careerops-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand-from))" />
          <stop offset="100%" stopColor="hsl(var(--brand-to))" />
        </linearGradient>
        {/* Soft neon glow for the locked blip. */}
        <filter id="careerops-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* App tile */}
      <rect width="32" height="32" rx="9" fill="url(#careerops-mark)" />

      {/* Radar: rings + sweep line locking onto the match */}
      <g fill="none" stroke="#ffffff" strokeLinecap="round">
        <circle cx="13" cy="19" r="8.5" strokeOpacity="0.22" strokeWidth="1.5" />
        <circle cx="13" cy="19" r="4.6" strokeOpacity="0.34" strokeWidth="1.5" />
        <line x1="13" y1="19" x2="21.5" y2="10.5" strokeOpacity="0.78" strokeWidth="1.8" />
      </g>
      {/* Radar centre */}
      <circle cx="13" cy="19" r="1.7" fill="#ffffff" />

      {/* Locked matched-role blip (glows) */}
      <g filter="url(#careerops-glow)">
        <circle cx="21.5" cy="10.5" r="3.4" fill="#ffffff" fillOpacity="0.28" />
        <circle cx="21.5" cy="10.5" r="2" fill="#ffffff" />
      </g>
    </svg>
  );
}

/**
 * Full wordmark: logo mark + "CareerOps" set in the display face (with a
 * gradient "Ops"), and an optional one-line subtitle underneath.
 */
export function Wordmark({
  className,
  markClassName,
  size = "md",
  subtitle,
}: {
  className?: string;
  markClassName?: string;
  size?: "sm" | "md" | "lg";
  subtitle?: string;
}) {
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const mark = size === "lg" ? "h-9 w-9" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo className={cn(mark, markClassName)} />
      <div className="leading-tight">
        <span className={cn("font-display font-bold tracking-tight", text)}>
          Career<span className="brand-text">Ops</span>
        </span>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

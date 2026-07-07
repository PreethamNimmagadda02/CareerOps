import { cn } from "@/lib/utils";

/** Brand voice — single source of truth for product messaging. */
export const BRAND = {
  name: "CareerOps",
  tagline: "The modern way to land your next role",
  mission:
    "Job hunting and career building, modernized — discover roles that fit, score them against your CV with AI, and run your whole pipeline from one command center.",
} as const;

/**
 * CareerOps logo mark — a gradient tile with a rising "career path" line and a
 * glowing goal node. Reads as growth / progress toward a destination.
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
      {/* Gradient definition for the futuristic hexagon */}
      <defs>
        <linearGradient id="careerops-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand-from))" />
          <stop offset="100%" stopColor="hsl(var(--brand-to))" />
        </linearGradient>
        {/* Glow filter to give a neon‑like outline */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Hexagonal mark with a subtle drop‑glow */}
      <polygon points="16,2 30,9 30,23 16,30 2,23 2,9" fill="url(#careerops-mark)" filter="url(#glow)" />
      {/* Futuristic path: crisp circuit‑style line */}
      <polyline
        points="8,21 14,15 19,18 24,10"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      {/* Accent node at the path’s end – glows softly */}
      <circle cx="24" cy="10" r="3" fill="white" opacity="0.3" />
      <circle cx="24" cy="10" r="1.5" fill="white" />
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

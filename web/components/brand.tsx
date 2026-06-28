import { cn } from "@/lib/utils";

/**
 * CareerOps logo mark — a gradient tile with a rising "career path" line and a
 * goal node. Reads as growth / progress toward a destination.
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
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#careerops-mark)" />
      <polyline
        points="8,21 14,15 19,18 24,10"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <circle cx="24" cy="10" r="2.6" fill="white" />
    </svg>
  );
}

/**
 * Full wordmark: logo mark + "CareerOps" (with a gradient "Ops"), and an
 * optional one-line subtitle underneath.
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
        <span className={cn("font-bold tracking-tight", text)}>
          Career<span className="brand-text">Ops</span>
        </span>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

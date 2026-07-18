import { cn } from "@/lib/utils";

/**
 * A smooth ring spinner — replaces Lucide's `Loader2` (which reads as a
 * ticking clock, segmented and mechanical) everywhere a busy-state icon is
 * needed. Inherits size via className (e.g. `h-4 w-4`) and color via
 * `currentColor`, so it drops into the same spots `Loader2` occupied.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current/20 border-t-current",
        className,
      )}
    />
  );
}

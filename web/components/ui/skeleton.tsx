import { cn } from "@/lib/utils";

/**
 * A content-shaped loading placeholder with a diagonal shimmer sweep — the
 * same gradient-sweep treatment already used on the onboarding résumé
 * dropzone, generalized so any block-shaped area (a table row, a form field,
 * an avatar) can show "this is coming" instead of a bare spinner or a blank
 * gap while it loads.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)}>
      <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(115deg,transparent_30%,hsl(var(--foreground)/0.08)_50%,transparent_70%)] bg-[length:220%_100%]" />
    </div>
  );
}

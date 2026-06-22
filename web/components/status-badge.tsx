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

export function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 4.2) return "text-ctp-green font-bold";
  if (score >= 3.8) return "text-ctp-yellow";
  if (score >= 3.0) return "text-foreground";
  return "text-ctp-red";
}

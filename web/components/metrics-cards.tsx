import { Briefcase, Gauge, Layers, Star, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { statusLabel, STATUS_GROUP_ORDER } from "@/lib/status";
import type { Metrics } from "@/lib/types";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
      {/* Brand sheen on hover — subtle, no layout cost. */}
      <div className="brand-gradient pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-80" />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <Icon className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-primary/70" />
        </div>
        <div className={cn("mt-1 font-display text-2xl font-bold tabular-nums", accent)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_DOT: Record<string, string> = {
  interview: "bg-ctp-green",
  offer: "bg-ctp-green",
  applied: "bg-ctp-sky",
  responded: "bg-ctp-blue",
  evaluated: "bg-muted-foreground",
  skip: "bg-ctp-red",
  rejected: "bg-muted-foreground/60",
  discarded: "bg-muted-foreground/60",
};

export function MetricsCards({ metrics }: { metrics: Metrics }) {
  const activeStatuses = STATUS_GROUP_ORDER.filter(
    (status) => status !== "evaluated" && metrics.byStatus[status] > 0
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total" value={String(metrics.total)} icon={Layers} />
        <Stat
          label="Top matches"
          value={String(metrics.topMatches)}
          accent="text-ctp-sky"
          icon={Target}
        />
        <Stat
          label="Avg score"
          value={metrics.avgScore > 0 ? metrics.avgScore.toFixed(2) : "—"}
          accent="text-ctp-yellow"
          icon={Gauge}
        />
        <Stat
          label="Top score"
          value={metrics.topScore > 0 ? metrics.topScore.toFixed(1) : "—"}
          accent="text-ctp-green"
          icon={Star}
        />
        <Stat label="With PDF" value={String(metrics.withPdf)} icon={Briefcase} />
      </div>

      {activeStatuses.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-x-5 gap-y-2 p-4">
            {activeStatuses.map((status) => {
              const count = metrics.byStatus[status];
              return (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} />
                  <span className="text-muted-foreground">{statusLabel(status)}</span>
                  <span className="font-semibold tabular-nums">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

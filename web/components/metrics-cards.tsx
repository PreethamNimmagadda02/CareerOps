import { Card, CardContent } from "@/components/ui/card";
import { statusLabel, STATUS_GROUP_ORDER } from "@/lib/status";
import type { Metrics } from "@/lib/types";
import { cn } from "@/lib/utils";

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-bold", accent)}>{value}</div>
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total" value={String(metrics.total)} />
        <Stat label="Actionable" value={String(metrics.actionable)} accent="text-ctp-sky" />
        <Stat
          label="Avg score"
          value={metrics.avgScore > 0 ? metrics.avgScore.toFixed(2) : "—"}
          accent="text-ctp-yellow"
        />
        <Stat
          label="Top score"
          value={metrics.topScore > 0 ? metrics.topScore.toFixed(1) : "—"}
          accent="text-ctp-green"
        />
        <Stat label="With PDF" value={String(metrics.withPdf)} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-x-5 gap-y-2 p-4">
          {STATUS_GROUP_ORDER.map((status) => {
            const count = metrics.byStatus[status];
            if (!count) return null;
            return (
              <div key={status} className="flex items-center gap-2 text-sm">
                <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} />
                <span className="text-muted-foreground">{statusLabel(status)}</span>
                <span className="font-semibold">{count}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

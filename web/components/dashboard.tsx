"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ExternalLink,
  FileText,
  Inbox,
  Layers,
  RefreshCw,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricsCards } from "@/components/metrics-cards";
import { PipelineProvider, usePipeline } from "@/components/pipeline-provider";
import { LaunchPad } from "@/components/launch-pad";
import { KeywordsManager } from "@/components/keywords-manager";
import { ReportModal } from "@/components/report-modal";
import { ScoreBadge } from "@/components/status-badge";
import { StatusSelect } from "@/components/status-menu";
import { useToast } from "@/components/ui/toast";
import { computeMetrics } from "@/lib/metrics";
import { normalizeStatus, statusLabel, statusPriority } from "@/lib/status";
import type { Application, OnboardingState } from "@/lib/types";
import type { PipelineCommand } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

type SortMode = "score" | "date" | "company" | "status";

const TABS = [
  { key: "all", label: "All" },
  { key: "evaluated", label: "Evaluated" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "top", label: "Top ≥4" },
  { key: "skip", label: "Skip" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Whether an application belongs under a given filter tab. */
function inTab(app: Application, key: TabKey): boolean {
  const norm = normalizeStatus(app.status);
  if (key === "all") return true;
  if (key === "top") return (app.score ?? 0) >= 4 && norm !== "skip";
  return norm === key;
}

export function Dashboard() {
  return (
    <PipelineProvider>
      <DashboardInner />
    </PipelineProvider>
  );
}

function DashboardInner() {
  const { run, running } = usePipeline();
  const toast = useToast();

  const [apps, setApps] = React.useState<Application[]>([]);
  const [onboarding, setOnboarding] = React.useState<OnboardingState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>("all");
  const [sort, setSort] = React.useState<SortMode>("score");
  const [grouped, setGrouped] = React.useState(true);
  const [openReport, setOpenReport] = React.useState<{ num: string; title: string } | null>(null);
  const [savingNum, setSavingNum] = React.useState<string | null>(null);
  const [keywordsOpen, setKeywordsOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, onbRes] = await Promise.all([
        fetch("/api/applications", { cache: "no-store" }),
        fetch("/api/onboarding", { cache: "no-store" }),
      ]);
      const appsData = await appsRes.json();
      if (!appsRes.ok) throw new Error(appsData.error || "Failed to load");
      setApps(appsData.applications as Application[]);
      if (onbRes.ok) {
        const onbData = await onbRes.json();
        setOnboarding(onbData.onboarding as OnboardingState);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Keep the "next step" accurate after the user edits their profile on the
  // /profile route and navigates/tabs back.
  React.useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const launchRun = React.useCallback(
    (command: PipelineCommand) => run(command, { onDone: load }),
    [run, load],
  );

  const metrics = React.useMemo(() => computeMetrics(apps), [apps]);

  // Single O(n) pass for every tab count (previously 6 filters per render).
  const tabCounts = React.useMemo(() => {
    const counts = Object.fromEntries(TABS.map((t) => [t.key, 0])) as Record<TabKey, number>;
    for (const app of apps) {
      for (const t of TABS) {
        if (inTab(app, t.key)) counts[t.key]++;
      }
    }
    return counts;
  }, [apps]);

  const filtered = React.useMemo(() => {
    const list = apps.filter((a) => inTab(a, tab));

    const byMode = (a: Application, b: Application) => {
      switch (sort) {
        case "score":
          return (b.score ?? 0) - (a.score ?? 0);
        case "date":
          return b.date.localeCompare(a.date);
        case "company":
          return a.company.toLowerCase().localeCompare(b.company.toLowerCase());
        case "status":
          return statusPriority(a.status) - statusPriority(b.status);
      }
    };

    return list.sort((a, b) => {
      if (grouped) {
        const pi = statusPriority(a.status);
        const pj = statusPriority(b.status);
        if (pi !== pj) return pi - pj;
      }
      return byMode(a, b);
    });
  }, [apps, tab, sort, grouped]);

  const changeStatus = React.useCallback(
    async (app: Application, newStatus: string) => {
      setSavingNum(app.num);
      try {
        const res = await fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            num: app.num,
            reportNumber: app.reportNumber ?? undefined,
            newStatus,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update");
        setApps((prev) =>
          prev.map((a) =>
            a.num === app.num
              ? { ...a, status: newStatus, normStatus: normalizeStatus(newStatus) }
              : a,
          ),
        );
        toast.success(
          "Status updated",
          `${app.company} → ${statusLabel(normalizeStatus(newStatus))}`,
        );
      } catch (err) {
        toast.error("Couldn't update status", (err as Error).message);
      } finally {
        setSavingNum(null);
      }
    },
    [toast],
  );

  const openReportFor = React.useCallback(
    (r: { num: string; title: string }) => setOpenReport(r),
    [],
  );

  const cycleSort = () => {
    const order: SortMode[] = ["score", "date", "company", "status"];
    setSort((s) => order[(order.indexOf(s) + 1) % order.length]);
  };

  const hasApps = apps.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Page heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Command center</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Discover, score, and track every role — all in one place.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Guided activation — the single focal point that tells the user what's next. */}
      <LaunchPad
        onboarding={onboarding}
        loading={loading && onboarding === null}
        running={running}
        onOpenKeywords={() => setKeywordsOpen(true)}
        onRun={launchRun}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {hasApps ? (
        <>
          <MetricsCards metrics={metrics} />

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-card/60 p-1"
              role="tablist"
              aria-label="Filter applications"
            >
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === t.key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {t.label}{" "}
                  <span className="text-xs tabular-nums opacity-70">{tabCounts[t.key]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={cycleSort}>
                <ArrowUpDown className="h-4 w-4" /> Sort: {sort}
              </Button>
              <Button
                variant={grouped ? "default" : "outline"}
                size="sm"
                onClick={() => setGrouped((g) => !g)}
              >
                <Layers className="h-4 w-4" /> Group
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2.5 text-left font-semibold">Score</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Company</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Role</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Comp</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <Rows
                    apps={filtered}
                    grouped={grouped}
                    savingNum={savingNum}
                    onChangeStatus={changeStatus}
                    onOpenReport={openReportFor}
                  />
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        No applications match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        !loading && <EmptyRoles onboarding={onboarding} onRun={launchRun} running={running} />
      )}

      <ReportModal
        reportNumber={openReport?.num ?? null}
        title={openReport?.title}
        onClose={() => setOpenReport(null)}
      />

      <KeywordsManager
        open={keywordsOpen}
        onClose={() => {
          setKeywordsOpen(false);
          void load();
        }}
      />
    </div>
  );
}

/** Friendly placeholder shown until the first roles are discovered. */
function EmptyRoles({
  onboarding,
  onRun,
  running,
}: {
  onboarding: OnboardingState | null;
  onRun: (command: PipelineCommand) => void;
  running: PipelineCommand | null;
}) {
  const ready = onboarding?.nextStep === "scan";
  const message = ready
    ? "You're ready — run a scan to discover roles that match your keywords."
    : "Finish the steps above, then run a scan to discover matching roles.";

  return (
    <Card className="bg-grid relative flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="brand-gradient flex h-12 w-12 items-center justify-center rounded-2xl opacity-90">
        <Inbox className="h-6 w-6 text-white" />
      </span>
      <div>
        <p className="font-display text-base font-semibold">No roles yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {ready && (
        <Button size="sm" onClick={() => onRun("scan:fallback")} disabled={running !== null}>
          {running === "scan" || running === "scan:fallback" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Run scan
        </Button>
      )}
    </Card>
  );
}

interface RowHandlers {
  savingNum: string | null;
  onChangeStatus: (app: Application, status: string) => void;
  onOpenReport: (r: { num: string; title: string }) => void;
}

/**
 * One application row. Memoized so status updates / console streams only
 * re-render the rows whose props actually changed.
 */
const AppRow = React.memo(function AppRow({
  app,
  saving,
  onChangeStatus,
  onOpenReport,
}: {
  app: Application;
  saving: boolean;
  onChangeStatus: RowHandlers["onChangeStatus"];
  onOpenReport: RowHandlers["onOpenReport"];
}) {
  return (
    <tr className="border-t border-border/60 transition-colors hover:bg-accent/40">
      <td className="whitespace-nowrap px-3 py-2">
        <ScoreBadge score={app.score} />
      </td>
      <td className="px-3 py-2 font-medium">{app.company}</td>
      <td className="max-w-[28rem] px-3 py-2 text-muted-foreground">
        <span className="line-clamp-1" title={app.role}>
          {app.role}
        </span>
      </td>
      <td className="px-3 py-2">
        <StatusSelect
          status={app.status}
          saving={saving}
          onChange={(s) => onChangeStatus(app, s)}
        />
      </td>
      <td className="px-3 py-2 text-ctp-yellow">{app.comp ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {app.reportNumber && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onOpenReport({
                  num: app.reportNumber!,
                  title: `${app.company} — ${app.role}`,
                })
              }
              title={`Open report #${app.reportNumber}`}
            >
              <FileText className="h-4 w-4" /> #{app.reportNumber}
            </Button>
          )}
          {app.jobUrl && (
            <a
              href={app.jobUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Open job posting"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
});

function Rows({
  apps,
  grouped,
  savingNum,
  onChangeStatus,
  onOpenReport,
}: RowHandlers & { apps: Application[]; grouped: boolean }) {
  const rows: React.ReactNode[] = [];
  let prevStatus = "";

  for (const app of apps) {
    const norm = normalizeStatus(app.status);
    if (grouped && norm !== prevStatus) {
      prevStatus = norm;
      rows.push(
        <tr key={`group-${norm}`} className="bg-background/60">
          <td
            colSpan={6}
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {statusLabel(norm)}
          </td>
        </tr>,
      );
    }

    rows.push(
      <AppRow
        key={app.num}
        app={app}
        saving={savingNum === app.num}
        onChangeStatus={onChangeStatus}
        onOpenReport={onOpenReport}
      />,
    );
  }

  return <>{rows}</>;
}

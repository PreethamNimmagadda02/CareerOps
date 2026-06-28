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
import { Wordmark } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
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

  const filtered = React.useMemo(() => {
    let list = apps.filter((a) => {
      const norm = normalizeStatus(a.status);
      switch (tab) {
        case "all":
          return true;
        case "top":
          return (a.score ?? 0) >= 4 && norm !== "skip";
        default:
          return norm === tab;
      }
    });

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

    list = [...list].sort((a, b) => {
      if (grouped) {
        const pi = statusPriority(a.status);
        const pj = statusPriority(b.status);
        if (pi !== pj) return pi - pj;
      }
      return byMode(a, b);
    });
    return list;
  }, [apps, tab, sort, grouped]);

  const tabCount = (key: TabKey) =>
    apps.filter((a) => {
      const norm = normalizeStatus(a.status);
      if (key === "all") return true;
      if (key === "top") return (a.score ?? 0) >= 4 && norm !== "skip";
      return norm === key;
    }).length;

  async function changeStatus(app: Application, newStatus: string) {
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
          a.num === app.num ? { ...a, status: newStatus, normStatus: normalizeStatus(newStatus) } : a,
        ),
      );
      toast.success("Status updated", `${app.company} → ${statusLabel(normalizeStatus(newStatus))}`);
    } catch (err) {
      toast.error("Couldn't update status", (err as Error).message);
    } finally {
      setSavingNum(null);
    }
  }

  const cycleSort = () => {
    const order: SortMode[] = ["score", "date", "company", "status"];
    setSort((s) => order[(order.indexOf(s) + 1) % order.length]);
  };

  const hasApps = apps.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header — kept intentionally minimal: identity + refresh only. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Wordmark size="lg" subtitle="Find, score, and track your next role." />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <UserMenu />
        </div>
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
            <div className="flex flex-wrap gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === t.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {t.label} <span className="opacity-70">({tabCount(t.key)})</span>
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
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">Company</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Comp</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {renderRows(filtered, grouped, {
                  savingNum,
                  onChangeStatus: changeStatus,
                  onOpenReport: setOpenReport,
                })}
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
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </span>
      <div>
        <p className="text-sm font-medium">No roles yet</p>
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

function renderRows(
  apps: Application[],
  grouped: boolean,
  handlers: {
    savingNum: string | null;
    onChangeStatus: (app: Application, status: string) => void;
    onOpenReport: (r: { num: string; title: string }) => void;
  },
) {
  const rows: React.ReactNode[] = [];
  let prevStatus = "";

  for (const app of apps) {
    const norm = normalizeStatus(app.status);
    if (grouped && norm !== prevStatus) {
      prevStatus = norm;
      rows.push(
        <tr key={`group-${norm}`} className="bg-background/60">
          <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {statusLabel(norm)}
          </td>
        </tr>,
      );
    }

    rows.push(
      <tr key={app.num} className="border-t border-border/60 transition-colors hover:bg-accent/40">
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
            saving={handlers.savingNum === app.num}
            onChange={(s) => handlers.onChangeStatus(app, s)}
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
                  handlers.onOpenReport({
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
      </tr>,
    );
  }

  return rows;
}

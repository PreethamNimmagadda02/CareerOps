"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ExternalLink,
  FileText,
  Layers,
  RefreshCw,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetricsCards } from "@/components/metrics-cards";
import { PipelineRunner } from "@/components/pipeline-runner";
import { ReportModal } from "@/components/report-modal";
import { StatusBadge, scoreColor } from "@/components/status-badge";
import { UserMenu } from "@/components/user-menu";
import { computeMetrics } from "@/lib/metrics";
import { normalizeStatus, statusLabel, statusPriority, STATUS_OPTIONS } from "@/lib/status";
import type { Application } from "@/lib/types";
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
  const [apps, setApps] = React.useState<Application[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>("all");
  const [sort, setSort] = React.useState<SortMode>("score");
  const [grouped, setGrouped] = React.useState(true);
  const [openReport, setOpenReport] = React.useState<{ num: string; title: string } | null>(null);
  const [savingNum, setSavingNum] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/applications", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setApps(data.applications as Application[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

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
    } catch (err) {
      alert(`Could not update status: ${(err as Error).message}`);
    } finally {
      setSavingNum(null);
    }
  }

  const cycleSort = () => {
    const order: SortMode[] = ["score", "date", "company", "status"];
    setSort((s) => order[(order.indexOf(s) + 1) % order.length]);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Career<span className="text-primary">Ops</span>
          </h1>
          <p className="text-sm text-muted-foreground">Job-search pipeline dashboard</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PipelineRunner onComplete={load} />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <UserMenu />
        </div>
      </div>

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

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

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
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No applications match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ReportModal
        reportNumber={openReport?.num ?? null}
        title={openReport?.title}
        onClose={() => setOpenReport(null)}
      />
    </div>
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
        <td className={cn("whitespace-nowrap px-3 py-2 tabular-nums", scoreColor(app.score))}>
          {app.score !== null ? app.score.toFixed(1) : "—"}
        </td>
        <td className="px-3 py-2 font-medium">{app.company}</td>
        <td className="max-w-[28rem] px-3 py-2 text-muted-foreground">
          <span className="line-clamp-1" title={app.role}>
            {app.role}
          </span>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={norm} />
            <select
              aria-label="Change status"
              value=""
              disabled={handlers.savingNum === app.num}
              onChange={(e) => e.target.value && handlers.onChangeStatus(app, e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">⋯</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
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

"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Inbox,
  Layers,
  RefreshCw,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { ApplicationInsights } from "@/components/application-detail";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricsCards } from "@/components/metrics-cards";
import { usePipeline } from "@/components/pipeline-provider";
import { LaunchPad } from "@/components/launch-pad";
import { KeywordsManager } from "@/components/keywords-manager";
import { ReportModal } from "@/components/report-modal";
import { RecommendationBadge, ScoreBadge } from "@/components/status-badge";
import { StatusSelect } from "@/components/status-menu";
import { useToast } from "@/components/ui/toast";
import { normalizeStatus, statusLabel, statusPriority } from "@/lib/status";
import type { Application, Metrics, OnboardingState, TabCounts } from "@/lib/types";
import type { PipelineCommand } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

type SortMode = "score" | "date" | "company" | "status";

const TABS = [
  { key: "all", label: "All" },
  { key: "apply", label: "Apply now" },
  { key: "evaluated", label: "Evaluated" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "skip", label: "Skip" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Whether an application belongs under a given filter tab. */
function inTab(app: Application, key: TabKey): boolean {
  const norm = normalizeStatus(app.status);
  if (key === "all") return true;
  if (key === "apply") {
    // The evaluation's verdict when we have one; a strong score otherwise
    // (covers rows evaluated before verdicts were persisted).
    if (norm === "skip") return false;
    if (app.recommendation) return app.recommendation === "APPLY_NOW";
    return (app.score ?? 0) >= 4;
  }
  if (key === "evaluated") {
    return norm === "evaluated" && (app.score !== null || app.recommendation !== null);
  }
  return norm === key;
}

export function Dashboard() {
  return <DashboardInner />;
}

function DashboardInner() {
  const { run, running } = usePipeline();
  const toast = useToast();

  const [apps, setApps] = React.useState<Application[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const [tabCounts, setTabCounts] = React.useState<TabCounts | null>(null);
  const [onboarding, setOnboarding] = React.useState<OnboardingState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>("all");
  const [sort, setSort] = React.useState<SortMode>("score");
  const [grouped, setGrouped] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [openReport, setOpenReport] = React.useState<{ num: string; title: string } | null>(null);
  const [savingNum, setSavingNum] = React.useState<string | null>(null);
  const [keywordsOpen, setKeywordsOpen] = React.useState(false);
  const [expandedNum, setExpandedNum] = React.useState<string | null>(null);

  // Metrics + tab counts are aggregated server-side (SQL), so they stay correct
  // and cheap regardless of how many application rows are actually loaded below.
  const refreshMetrics = React.useCallback(async () => {
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMetrics(data.metrics as Metrics);
      setTabCounts(data.tabCounts as TabCounts);
    } catch {
      /* non-fatal — the table still renders without the metric cards */
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, onbRes] = await Promise.all([
        // First page only — subsequent pages load on demand via "Load more".
        fetch("/api/applications", { cache: "no-store" }),
        fetch("/api/onboarding", { cache: "no-store" }),
        refreshMetrics(),
      ]);
      const appsData = await appsRes.json();
      if (!appsRes.ok) throw new Error(appsData.error || "Failed to load");
      setApps(appsData.applications as Application[]);
      setNextCursor((appsData.nextCursor as string | null) ?? null);
      if (onbRes.ok) {
        const onbData = await onbRes.json();
        setOnboarding(onbData.onboarding as OnboardingState);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refreshMetrics]);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/applications?cursor=${encodeURIComponent(nextCursor)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load more");
      setApps((prev) => [...prev, ...(data.applications as Application[])]);
      setNextCursor((data.nextCursor as string | null) ?? null);
    } catch (err) {
      toast.error("Couldn't load more", (err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, toast]);

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

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = apps.filter((a) => {
      if (!inTab(a, tab)) return false;
      if (!q) return true;
      return (
        a.company.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        (a.status ?? "").toLowerCase().includes(q)
      );
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

    return list.sort((a, b) => {
      if (grouped) {
        const pi = statusPriority(a.status);
        const pj = statusPriority(b.status);
        if (pi !== pj) return pi - pj;
      }
      return byMode(a, b);
    });
  }, [apps, tab, sort, grouped, search]);

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
        // A status change shifts the funnel — refresh the SQL-aggregated
        // metrics + tab counts so the cards and tab badges stay accurate.
        void refreshMetrics();
      } catch (err) {
        toast.error("Couldn't update status", (err as Error).message);
      } finally {
        setSavingNum(null);
      }
    },
    [toast, refreshMetrics],
  );

  const openReportFor = React.useCallback(
    (r: { num: string; title: string }) => setOpenReport(r),
    [],
  );

  const toggleExpanded = React.useCallback(
    (num: string) => setExpandedNum((cur) => (cur === num ? null : num)),
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
          {metrics && <MetricsCards metrics={metrics} />}

          {/* Controls */}
          <div className="flex flex-col gap-3">
            {/* Search bar */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="app-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by company, role, or status…"
                aria-label="Search applications"
                className="h-9 w-full rounded-lg border border-border/70 bg-card/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Tab filters + sort/group */}
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
                    <span className="text-xs tabular-nums opacity-70">
                      {tabCounts ? tabCounts[t.key] : ""}
                    </span>
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
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-8 px-2 py-2.5" aria-label="Expand" />
                    <th className="px-3 py-2.5 text-left font-semibold">Score</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Company</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Role</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Verdict</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <Rows
                    apps={filtered}
                    grouped={grouped}
                    savingNum={savingNum}
                    expandedNum={expandedNum}
                    onToggleExpanded={toggleExpanded}
                    onChangeStatus={changeStatus}
                    onOpenReport={openReportFor}
                  />
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                        {search.trim()
                          ? `No applications match "${search.trim()}".`
                          : "No applications match this filter."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination — the list is fetched a page at a time so a large
              account never loads its whole history at once. Search/sort above
              operate on the rows loaded so far. */}
          {nextCursor && !search.trim() && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Load more
              </Button>
            </div>
          )}
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
  expandedNum: string | null;
  onToggleExpanded: (num: string) => void;
  onChangeStatus: (app: Application, status: string) => void;
  onOpenReport: (r: { num: string; title: string }) => void;
}

/**
 * One application row. Memoized so status updates / row expansion / console
 * streams only re-render the rows whose props actually changed. Clicking the
 * row toggles the insights drawer; interactive children stop propagation.
 */
const AppRow = React.memo(function AppRow({
  app,
  saving,
  expanded,
  onToggleExpanded,
  onChangeStatus,
  onOpenReport,
}: {
  app: Application;
  saving: boolean;
  expanded: boolean;
  onToggleExpanded: RowHandlers["onToggleExpanded"];
  onChangeStatus: RowHandlers["onChangeStatus"];
  onOpenReport: RowHandlers["onOpenReport"];
}) {
  return (
    <tr
      className={cn(
        "cursor-pointer border-t border-border/60 transition-colors hover:bg-accent/40",
        expanded && "bg-accent/30",
      )}
      onClick={() => onToggleExpanded(app.num)}
      aria-expanded={expanded}
    >
      <td className="px-2 py-2 text-center">
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-transform",
            expanded && "rotate-90 text-muted-foreground",
          )}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <ScoreBadge score={app.score} />
      </td>
      <td className="px-3 py-2 font-medium">{app.company}</td>
      <td className="max-w-[24rem] px-3 py-2 text-muted-foreground">
        <span className="line-clamp-1" title={app.role}>
          {app.role}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <RecommendationBadge recommendation={app.recommendation} />
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <StatusSelect
          status={app.status}
          saving={saving}
          onChange={(s) => onChangeStatus(app, s)}
        />
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
  expandedNum,
  onToggleExpanded,
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
            colSpan={7}
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {statusLabel(norm)}
          </td>
        </tr>,
      );
    }

    const expanded = expandedNum === app.num;
    rows.push(
      <AppRow
        key={app.num}
        app={app}
        saving={savingNum === app.num}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        onChangeStatus={onChangeStatus}
        onOpenReport={onOpenReport}
      />,
    );

    if (expanded) {
      rows.push(
        <tr key={`${app.num}-detail`} className="border-t border-border/40 bg-accent/15">
          <td />
          <td colSpan={6} className="animate-fade-in px-3 pb-4 pt-2">
            <ApplicationInsights app={app} />
          </td>
        </tr>,
      );
    }
  }

  return <>{rows}</>;
}

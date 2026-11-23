"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleMinus,
  ExternalLink,
  FileText,
  ListChecks,
  MoreHorizontal,
  PartyPopper,
  Search,
  SlidersHorizontal,
  Star,
  Undo2,
} from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Tab, TabList, TabMenu } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";

import { ApplicationInsights } from "@/components/application-detail";
import { Page, PageHeader } from "@/components/page";
import { usePipelineStatus } from "@/components/pipeline-provider";
import { LaunchPad } from "@/components/launch-pad";
import { ReportModal, type ReportTarget } from "@/components/report-modal";
import {
  AdviceBadge,
  FitMeter,
  StatusPillContent,
  statusPillClass,
} from "@/components/status-badge";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { NEXT_STEP, STATUS_GROUPS } from "@/lib/labels";
import { normalizeStatus, statusLabel, statusPriority } from "@/lib/status";
import type { Application, OnboardingState, TabCounts } from "@/lib/types";

type SortMode = "score" | "date" | "company" | "status";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "score", label: "Best fit first" },
  { value: "date", label: "Newest first" },
  { value: "company", label: "Company name (A–Z)" },
  { value: "status", label: "Where you are" },
];

/** How stale the loaded data must be before a window refocus refetches it. */
const REFRESH_STALE_MS = 30_000;

/** Page size for "Show all my jobs" — the server's maximum. */
const LOAD_ALL_PAGE_SIZE = 500;

/**
 * The filters. They never overlap — every job sits in exactly one of the
 * last five — so the counts on them always add up to "All jobs".
 */
const TABS = [
  { key: "all", label: "All jobs" },
  { key: "apply", label: "Apply now" },
  { key: "progress", label: "In progress" },
  { key: "review", label: "To review" },
  { key: "skip", label: "Not for me" },
  { key: "rejected", label: "Not selected" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Three filters stay visible on wide screens; the rest sit behind "More". */
const VISIBLE_TABS = TABS.slice(0, 3);
const MORE_TABS = TABS.slice(3);

/** Normalized status → the stored value the status picker works with. */
const STATUS_VALUE: Record<string, string> = {
  evaluated: "Evaluated",
  applied: "Applied",
  responded: "Responded",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  skip: "SKIP",
  discarded: "SKIP",
};

/** Each stage in the status picker, with what it means in plain words. */
const STATUS_HINT: Record<string, string> = {
  Evaluated: "You haven't done anything with it yet",
  Applied: "You sent your application",
  Responded: "They replied to you",
  Interview: "You have an interview",
  Offer: "They offered you the job",
  Rejected: "They chose someone else",
  SKIP: "You don't want this job",
};

const STATUS_CHOICES = STATUS_GROUPS.flatMap((g) => g.options);

const IN_PROGRESS = new Set(["applied", "responded", "interview", "offer"]);

/** Not acted on yet, and our advice is to apply now. */
function isApplyNow(app: Application): boolean {
  if (normalizeStatus(app.status) !== "evaluated") return false;
  // The evaluation's verdict when we have one; a strong score otherwise
  // (covers rows evaluated before verdicts were persisted). Mirrors the SQL
  // count in lib/metrics-db.ts.
  if (app.recommendation) return app.recommendation === "APPLY_NOW";
  return (app.score ?? 0) >= 4;
}

/** Whether an application belongs under a given filter tab. */
function inTab(app: Application, key: TabKey): boolean {
  const norm = normalizeStatus(app.status);
  switch (key) {
    case "all":
      return true;
    case "apply":
      return isApplyNow(app);
    case "review":
      return norm === "evaluated" && !isApplyNow(app);
    case "progress":
      return IN_PROGRESS.has(norm);
    case "skip":
      return norm === "skip" || norm === "discarded";
    case "rejected":
      return norm === "rejected";
  }
}

/** A just-made status change, kept on screen (with Undo) until the next one. */
interface StatusChange {
  num: string;
  /** Stored status before the change — what Undo puts back. */
  from: string;
  to: string;
}

/** What the confirmation under a job says after a status change. */
function changeText(to: string): string {
  switch (to) {
    case "Offer":
      return "Congratulations on the offer!";
    case "SKIP":
      return "Moved to Not for me.";
    case "Evaluated":
      return "Moved back to To review.";
    default:
      return `Marked as ${statusLabel(normalizeStatus(to)).toLowerCase()}.`;
  }
}

/** "Added 20 Nov" — the year only when it isn't this year. */
function addedOn(date: string): string | null {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Added ${d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}

export function Dashboard() {
  return <DashboardInner />;
}

function DashboardInner() {
  // Status only — the list must not re-render on every poll tick of a run's
  // log (see the two-context note in pipeline-provider).
  const { run, cancel, running, percent, progressLabel } = usePipelineStatus();
  const toast = useToast();
  const { data: session } = useSession();

  const [apps, setApps] = React.useState<Application[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingAll, setLoadingAll] = React.useState(false);
  const [tabCounts, setTabCounts] = React.useState<TabCounts | null>(null);
  const [onboarding, setOnboarding] = React.useState<OnboardingState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTabState] = React.useState<TabKey>("all");
  const [sort, setSort] = React.useState<SortMode>("score");
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [openReport, setOpenReport] = React.useState<ReportTarget | null>(null);
  const [statusFor, setStatusFor] = React.useState<Application | null>(null);
  const [savingNum, setSavingNum] = React.useState<string | null>(null);
  const [expandedNum, setExpandedNum] = React.useState<string | null>(null);
  const [lastChange, setLastChange] = React.useState<StatusChange | null>(null);
  /** Epoch ms of the last successful load — gates the on-focus refresh. */
  const lastLoadedAtRef = React.useRef(0);
  // The dialogs below render only after hydration: a closed Astryx Dialog
  // mounts into a different place in the tree on the server than on the
  // client, which made the ids inside it mismatch on load.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  // Switching filters ends the "just changed" grace period, so a job that no
  // longer belongs in the old filter doesn't follow you into the new one.
  const setTab = React.useCallback((next: TabKey) => {
    setTabState(next);
    setLastChange(null);
  }, []);

  // Grouping by status only makes sense when sorting by it.
  const grouped = sort === "status";

  // Tab counts are aggregated server-side (SQL), so they stay correct and
  // cheap regardless of how many application rows are actually loaded below.
  const refreshMetrics = React.useCallback(async () => {
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setTabCounts(data.tabCounts as TabCounts);
    } catch {
      /* non-fatal — the filters just show no counts */
    }
  }, []);

  const load = React.useCallback(
    async ({ background = false } = {}) => {
      // A background refresh keeps the current list on screen — only a cold
      // load is allowed to show placeholders.
      if (!background) setLoading(true);
      setError(null);
      try {
        const [appsRes, onbRes] = await Promise.all([
          // First page only (newest first) — the rest via "Show all my jobs".
          fetch("/api/applications", { cache: "no-store" }),
          fetch("/api/onboarding", { cache: "no-store" }),
          refreshMetrics(),
        ]);
        if (!appsRes.ok) throw new Error(`HTTP ${appsRes.status}`);
        const appsData = await appsRes.json();
        setApps(appsData.applications as Application[]);
        setNextCursor((appsData.nextCursor as string | null) ?? null);
        if (onbRes.ok) {
          const onbData = await onbRes.json();
          setOnboarding(onbData.onboarding as OnboardingState);
        }
        lastLoadedAtRef.current = Date.now();
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        if (!background) setLoading(false);
      }
    },
    [refreshMetrics],
  );

  const reloadQuietly = React.useCallback(() => void load({ background: true }), [load]);

  /** Load every remaining page, so search, sort and filters cover every job. */
  const loadAll = React.useCallback(async () => {
    if (!nextCursor || loadingAll) return;
    setLoadingAll(true);
    let cursor: string | null = nextCursor;
    try {
      while (cursor) {
        const res: Response = await fetch(
          `/api/applications?limit=${LOAD_ALL_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const page = data.applications as Application[];
        setApps((prev) => {
          const seen = new Set(prev.map((a) => a.num));
          return [...prev, ...page.filter((a) => !seen.has(a.num))];
        });
        cursor = (data.nextCursor as string | null) ?? null;
        setNextCursor(cursor);
      }
    } catch (err) {
      toast.error("We couldn't load the rest of your jobs", friendlyError(err), {
        label: "Try again",
        onClick: () => void loadAll(),
      });
    } finally {
      setLoadingAll(false);
    }
  }, [nextCursor, loadingAll, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Keep the "next step" accurate after the user edits their profile on the
  // /profile route and navigates/tabs back.
  //
  // Reading a job posting in another tab and flicking back is the core loop of
  // this app, so an unconditional refetch here fired three requests every few
  // seconds. Refresh in the background, no more than once per REFRESH_STALE_MS,
  // and never while a run is live — that run's own `onDone` already reloads.
  React.useEffect(() => {
    const onFocus = () => {
      if (running) return;
      if (Date.now() - lastLoadedAtRef.current < REFRESH_STALE_MS) return;
      reloadQuietly();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadQuietly, running]);

  /** Search for jobs, then — like setup does — check how well the new ones fit. */
  const findJobs = React.useCallback(() => {
    run("scan:fallback", {
      quietSuccess: true,
      onDone: (outcome) => {
        reloadQuietly();
        if (outcome === "Succeeded") run("evaluate:all", { onDone: reloadQuietly });
      },
    });
  }, [run, reloadQuietly]);

  const checkJobs = React.useCallback(() => {
    run("evaluate:all", { onDone: reloadQuietly });
  }, [run, reloadQuietly]);

  // `/?find=1` (e.g. "Find new jobs" after widening the search on the profile
  // page) starts a search straight away.
  const findHandled = React.useRef(false);
  React.useEffect(() => {
    if (findHandled.current) return;
    findHandled.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("find") !== "1") return;
    url.searchParams.delete("find");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (!running) findJobs();
  }, [findJobs, running]);

  /** Open one job: show it in the list, expand it, and bring it into view. */
  const showJob = React.useCallback(
    (num: string) => {
      setTab("all");
      setSearch("");
      setExpandedNum(num);
      window.setTimeout(() => {
        const el = document.getElementById(`job-${num}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
      }, 60);
    },
    [setTab],
  );

  // `/?job=<id>` (e.g. "See this job" at the end of setup) opens that job.
  const deepLinkHandled = React.useRef(false);
  React.useEffect(() => {
    if (deepLinkHandled.current || apps.length === 0) return;
    deepLinkHandled.current = true;
    const url = new URL(window.location.href);
    const job = url.searchParams.get("job");
    if (!job) return;
    url.searchParams.delete("job");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (apps.some((a) => a.num === job)) showJob(job);
  }, [apps, showJob]);

  const bestJob = React.useMemo(
    () =>
      apps.reduce<Application | null>(
        (best, a) =>
          a.score !== null && (best === null || a.score > (best.score ?? 0)) ? a : best,
        null,
      ),
    [apps],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = apps.filter((a) => {
      // A job you just moved stays put (with its Undo) until you change filter.
      if (!inTab(a, tab) && a.num !== lastChange?.num) return false;
      if (!q) return true;
      return (
        a.company.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        statusLabel(normalizeStatus(a.status)).toLowerCase().includes(q)
      );
    });

    const byMode = (a: Application, b: Application) => {
      switch (sort) {
        case "score":
        case "status":
          return (b.score ?? 0) - (a.score ?? 0);
        case "date":
          return b.date.localeCompare(a.date);
        case "company":
          return a.company.toLowerCase().localeCompare(b.company.toLowerCase());
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
  }, [apps, tab, sort, grouped, search, lastChange]);

  const changeStatus = React.useCallback(
    async (app: Application, newStatus: string, { isUndo = false } = {}) => {
      const from = STATUS_VALUE[normalizeStatus(app.status)] ?? app.status;
      if (from === newStatus) return;
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setApps((prev) =>
          prev.map((a) =>
            a.num === app.num
              ? { ...a, status: newStatus, normStatus: normalizeStatus(newStatus) }
              : a,
          ),
        );
        setLastChange(isUndo ? null : { num: app.num, from, to: newStatus });
        if (isUndo) {
          // The confirmation (and its Undo button) just went away — put the
          // keyboard back somewhere sensible: the job's own heading.
          window.setTimeout(
            () => document.getElementById(`job-title-${app.num}`)?.focus({ preventScroll: true }),
            0,
          );
        }
        // A status change shifts the funnel — refresh the SQL-aggregated
        // filter counts so they stay accurate.
        void refreshMetrics();
      } catch (err) {
        toast.error("We couldn't save that change", friendlyError(err), {
          label: "Try again",
          onClick: () => void changeStatus(app, newStatus, { isUndo }),
        });
      } finally {
        setSavingNum(null);
      }
    },
    [toast, refreshMetrics],
  );

  const undoChange = React.useCallback(
    (app: Application) => {
      if (lastChange?.num !== app.num) return;
      void changeStatus(app, lastChange.from, { isUndo: true });
    },
    [lastChange, changeStatus],
  );

  const toggleExpanded = React.useCallback(
    (num: string) => setExpandedNum((cur) => (cur === num ? null : num)),
    [],
  );

  const hasApps = apps.length > 0;
  const settingUp = onboarding !== null && !onboarding.complete;
  const firstName = session?.user?.name?.split(" ")[0];
  const countFor = (key: TabKey) => (tabCounts && tabCounts[key] != null ? tabCounts[key] : null);
  const tabLabel = (key: TabKey, label: string) => {
    const n = countFor(key);
    return n == null ? label : `${label} (${n})`;
  };
  const currentTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const currentSort = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];
  const searching = search.trim().length > 0;
  const showSearchField = searchOpen || searching;

  const description = settingUp
    ? "Let's get you set up. It takes about 5 minutes."
    : firstName
      ? `Hi ${firstName}. Here are your jobs, best fit first.`
      : "Here are your jobs, best fit first.";

  return (
    <Page>
      <PageHeader title="My jobs" description={description} />

      {/* What to do next — the single focal point of the page. */}
      <LaunchPad
        onboarding={onboarding}
        loading={loading && onboarding === null}
        running={running}
        percent={percent}
        progressLabel={progressLabel}
        onFindJobs={findJobs}
        onCheckJobs={checkJobs}
        onStop={cancel}
        bestJob={bestJob}
        onShowJob={showJob}
      />

      {error && (
        <Banner
          status="error"
          title="We couldn't load your jobs"
          description={error}
          collapsible={false}
          endContent={<Button label="Try again" variant="secondary" onClick={() => void load()} />}
        />
      )}

      {hasApps ? (
        <VStack gap={4} as="section" aria-labelledby="your-jobs-heading">
          {/* The page title already says "My jobs" — this heading is for
              screen-reader navigation only. */}
          <Heading level={2} id="your-jobs-heading" className="sr-only">
            Your jobs
          </Heading>

          {/* Wide screens: a short tab row, then search and sort side by side. */}
          <VStack gap={4} className="hidden sm:flex">
            <TabList value={tab} onChange={(v) => setTab(v as TabKey)} hasDivider>
              {VISIBLE_TABS.map((t) => (
                <Tab key={t.key} value={t.key} label={tabLabel(t.key, t.label)} />
              ))}
              <TabMenu
                label="More"
                options={MORE_TABS.map((t) => ({
                  value: t.key,
                  label: tabLabel(t.key, t.label),
                }))}
              />
            </TabList>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
              <TextInput
                type="search"
                label="Search your jobs"
                placeholder="Job title or company"
                startIcon={<Icon icon={Search} />}
                value={search}
                onChange={setSearch}
              />
              <Selector
                label="Sort by"
                options={SORT_OPTIONS}
                value={sort}
                onChange={(v) => v && setSort(v as SortMode)}
                width="100%"
              />
            </div>
          </VStack>

          {/* Phones: one control for what to show and in what order, and a
              Search button — so the first job is near the top of the screen. */}
          <VStack gap={3} className="sm:hidden">
            <HStack gap={3}>
              <div className="min-w-0 flex-1">
                <Button
                  label={tabLabel(currentTab.key, currentTab.label)}
                  aria-label={`Show and sort. Showing ${tabLabel(currentTab.key, currentTab.label)}, ${currentSort.label.toLowerCase()}.`}
                  variant="secondary"
                  icon={<Icon icon={SlidersHorizontal} />}
                  endContent={<Icon icon={ChevronDown} />}
                  onClick={() => setViewOpen(true)}
                  className="w-full"
                />
              </div>
              <Button
                label="Search"
                variant="secondary"
                icon={<Icon icon={Search} />}
                aria-expanded={showSearchField}
                aria-controls="phone-job-search"
                onClick={() => {
                  if (showSearchField) setSearch("");
                  setSearchOpen(!showSearchField);
                }}
              />
            </HStack>
            {showSearchField && (
              <div id="phone-job-search">
                <TextInput
                  type="search"
                  label="Search your jobs"
                  isLabelHidden
                  placeholder="Job title or company"
                  startIcon={<Icon icon={Search} />}
                  value={search}
                  onChange={setSearch}
                  hasAutoFocus
                />
              </div>
            )}
          </VStack>

          {/* Search only sees the jobs loaded so far — say so, with the fix.
              (The note under the list covers sorting.) */}
          {nextCursor && searching && (
            <Text color="secondary">
              Only your newest {apps.length} jobs are included.{" "}
              <button
                type="button"
                onClick={() => void loadAll()}
                className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              >
                Include all my jobs
              </button>
            </Text>
          )}

          {filtered.length === 0 ? (
            <Card padding={6}>
              <EmptyState
                title={searching ? `No jobs match "${search.trim()}"` : "No jobs here yet"}
                description={
                  searching
                    ? "Try a different word, or clear the search."
                    : "Jobs will show up here as you move them along."
                }
                actions={
                  searching ? (
                    <Button
                      label="Clear search"
                      variant="secondary"
                      onClick={() => setSearch("")}
                    />
                  ) : tab !== "all" ? (
                    <Button
                      label="Show all jobs"
                      variant="secondary"
                      onClick={() => setTab("all")}
                    />
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <JobList
              apps={filtered}
              grouped={grouped}
              bestNum={bestJob && (bestJob.score ?? 0) >= 4 ? bestJob.num : null}
              savingNum={savingNum}
              expandedNum={expandedNum}
              lastChange={lastChange}
              onToggleExpanded={toggleExpanded}
              onChangeStatus={changeStatus}
              onUndo={undoChange}
              onPickStatus={setStatusFor}
              onOpenReport={setOpenReport}
            />
          )}

          {/* The list loads a page at a time (newest first), so a large
              account never fetches its whole history up front. */}
          {nextCursor && (
            <VStack gap={2} hAlign="center">
              <Text color="secondary">
                Showing your newest {apps.length}
                {tabCounts ? ` of ${tabCounts.all}` : ""} jobs.
              </Text>
              <Button
                label="Show all my jobs"
                variant="secondary"
                size="lg"
                isLoading={loadingAll}
                onClick={() => void loadAll()}
              />
            </VStack>
          )}
        </VStack>
      ) : loading ? (
        <Card padding={6}>
          <VStack gap={6}>
            {Array.from({ length: 3 }).map((_, i) => (
              <VStack key={i} gap={2}>
                <Skeleton height={24} width="50%" index={i} />
                <Skeleton height={20} width="30%" index={i} />
                <Skeleton height={16} width={140} index={i} />
              </VStack>
            ))}
          </VStack>
        </Card>
      ) : !error && !settingUp ? (
        <Card padding={8}>
          <EmptyState
            icon={<Icon icon={Search} size="lg" />}
            title="No jobs yet"
            description="Jobs we find for you will appear here, with how well each one fits."
          />
        </Card>
      ) : null}

      {hydrated && (
        <>
          <ViewDialog
            isOpen={viewOpen}
            onClose={() => setViewOpen(false)}
            tab={tab}
            onTab={setTab}
            sort={sort}
            onSort={setSort}
            tabLabel={tabLabel}
          />

          <StatusDialog
            app={statusFor}
            onClose={() => setStatusFor(null)}
            onSave={(app, value) => void changeStatus(app, value)}
          />

          <ReportModal target={openReport} onClose={() => setOpenReport(null)} />
        </>
      )}
    </Page>
  );
}

/** Phones: what to show and in what order, as two short lists of big choices. */
function ViewDialog({
  isOpen,
  onClose,
  tab,
  onTab,
  sort,
  onSort,
  tabLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  tab: TabKey;
  onTab: (t: TabKey) => void;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  tabLabel: (key: TabKey, label: string) => string;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      width="min(520px, calc(100vw - 2rem))"
      maxHeight="90dvh"
    >
      <DialogHeader title="Show and sort" onOpenChange={(open) => !open && onClose()} />
      <VStack gap={6} padding={6}>
        <RadioList label="Show" value={tab} onChange={(v) => onTab(v as TabKey)}>
          {TABS.map((t) => (
            <RadioListItem
              key={t.key}
              value={t.key}
              label={tabLabel(t.key, t.label)}
              className="min-h-14"
            />
          ))}
        </RadioList>
        <RadioList label="Sort by" value={sort} onChange={(v) => onSort(v as SortMode)}>
          {SORT_OPTIONS.map((o) => (
            <RadioListItem key={o.value} value={o.value} label={o.label} className="min-h-14" />
          ))}
        </RadioList>
        <Button label="Done" variant="primary" size="lg" onClick={onClose} className="w-full" />
      </VStack>
    </Dialog>
  );
}

/**
 * "Where are you with this job?" — every stage as a big, described choice,
 * instead of a long scrolling menu. Nothing changes until Save.
 */
function StatusDialog({
  app,
  onClose,
  onSave,
}: {
  app: Application | null;
  onClose: () => void;
  onSave: (app: Application, value: string) => void;
}) {
  const current = app ? (STATUS_VALUE[normalizeStatus(app.status)] ?? "Evaluated") : "Evaluated";
  const [value, setValue] = React.useState(current);
  React.useEffect(() => setValue(current), [app?.num, current]);

  return (
    <Dialog
      isOpen={app !== null}
      onOpenChange={(open) => !open && onClose()}
      width="min(560px, calc(100vw - 2rem))"
      maxHeight="90dvh"
      purpose="form"
    >
      <DialogHeader
        // A short title that fits a phone; the job is named underneath.
        title="Where are you with this job?"
        subtitle={app ? `${app.role} at ${app.company}` : undefined}
        onOpenChange={(open) => !open && onClose()}
      />
      <VStack gap={6} padding={6}>
        <RadioList
          label="Where you are with this job"
          isLabelHidden
          value={value}
          onChange={setValue}
        >
          {STATUS_CHOICES.map((o) => (
            <RadioListItem
              key={o.value}
              value={o.value}
              label={o.label}
              description={STATUS_HINT[o.value]}
              className="min-h-14"
            />
          ))}
        </RadioList>
        <HStack gap={3} hAlign="end" wrap="wrap">
          <Button label="Cancel" variant="secondary" size="lg" onClick={onClose} />
          <Button
            label="Save"
            variant="primary"
            size="lg"
            onClick={() => {
              if (app && value !== current) onSave(app, value);
              onClose();
            }}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}

interface RowHandlers {
  savingNum: string | null;
  expandedNum: string | null;
  lastChange: StatusChange | null;
  bestNum: string | null;
  onToggleExpanded: (num: string) => void;
  onChangeStatus: (app: Application, status: string) => void;
  onUndo: (app: Application) => void;
  onPickStatus: (app: Application) => void;
  onOpenReport: (r: ReportTarget) => void;
}

/**
 * One job. A real heading (so screen-reader users can jump job to job), how
 * well it fits, then EITHER our advice (not acted on yet) OR where you are
 * with it, as a pill you can tap to change. At most three visible actions —
 * the job post, the one next step, and details; the rest sit behind "More".
 * Memoized so a status change re-renders only that row.
 */
const JobRow = React.memo(function JobRow({
  app,
  saving,
  expanded,
  change,
  isBest,
  onToggleExpanded,
  onChangeStatus,
  onUndo,
  onPickStatus,
  onOpenReport,
}: {
  app: Application;
  saving: boolean;
  expanded: boolean;
  change: StatusChange | null;
  isBest: boolean;
  onToggleExpanded: RowHandlers["onToggleExpanded"];
  onChangeStatus: RowHandlers["onChangeStatus"];
  onUndo: RowHandlers["onUndo"];
  onPickStatus: RowHandlers["onPickStatus"];
  onOpenReport: RowHandlers["onOpenReport"];
}) {
  const norm = normalizeStatus(app.status);
  const actedOn = norm !== "evaluated";
  const next = NEXT_STEP[norm];
  const leadsWithPost = isApplyNow(app);
  const titleId = `job-title-${app.num}`;
  const detailsId = `job-details-${app.num}`;
  const jobName = `${app.role} at ${app.company}`;
  const added = addedOn(app.date);
  const openReport = () =>
    app.reportNumber &&
    onOpenReport({
      reportNumber: app.reportNumber,
      title: jobName,
      score: app.score,
      recommendation: app.recommendation ?? null,
      jobUrl: app.jobUrl,
    });

  // After a change, move the keyboard to the confirmation's Undo — the button
  // that was pressed now means the *next* step, so staying on it would make a
  // second press advance the job again.
  const confirmRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (change) confirmRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [change]);

  return (
    <li id={`job-${app.num}`} className="scroll-mt-24 border-t border-border first:border-t-0">
      <article aria-labelledby={titleId} className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
          <VStack gap={0.5} className="min-w-0">
            {isBest && (
              <HStack gap={1.5} vAlign="center">
                <Icon icon={Star} size="sm" color="accent" />
                <Text weight="semibold" color="accent">
                  Your best match
                </Text>
              </HStack>
            )}
            <Heading level={3} id={titleId} tabIndex={-1} className="outline-none">
              {app.role}
            </Heading>
            <Text color="secondary">
              {app.company}
              {app.remote ? ` · ${app.remote}` : ""}
            </Text>
            {added && <Text color="secondary">{added}</Text>}
          </VStack>
          <div className="md:shrink-0 md:pt-1">
            <FitMeter score={app.score} />
          </div>
        </div>

        {actedOn ? (
          <div>
            <button
              type="button"
              onClick={() => onPickStatus(app)}
              aria-label={`Where you are with ${jobName}: ${statusLabel(norm)}. Change`}
              className={`${statusPillClass(norm)} outline-none transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
            >
              <StatusPillContent status={norm} />
              <Icon icon={ChevronDown} size="sm" />
            </button>
          </div>
        ) : app.recommendation ? (
          <div>
            <AdviceBadge recommendation={app.recommendation} />
          </div>
        ) : null}

        {change && (
          <div
            ref={confirmRef}
            role="status"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-primary/10 px-4 py-3"
          >
            <HStack gap={2} vAlign="center" className="min-w-0 flex-1">
              <Icon
                icon={change.to === "Offer" ? PartyPopper : CircleCheck}
                color="accent"
                size="md"
              />
              <Text weight="semibold">{changeText(change.to)}</Text>
            </HStack>
            <Button
              label="Undo"
              variant="secondary"
              icon={<Icon icon={Undo2} />}
              isLoading={saving}
              onClick={() => onUndo(app)}
              aria-label={`Undo: ${changeText(change.to)} ${jobName}`}
            />
          </div>
        )}

        {/* Two pairs that each stay together when the row wraps on a phone:
            act on the job, then look closer. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {app.jobUrl ? (
              <Button
                label="Go to job post"
                variant="secondary"
                endContent={<Icon icon={ExternalLink} />}
                href={app.jobUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Go to job post for ${jobName} (opens in a new tab)`}
                // "Apply now" jobs: the post is where to go next — an accent
                // outline leads the eye without adding a second filled button.
                className={leadsWithPost ? "ring-2 ring-inset ring-primary" : undefined}
              />
            ) : (
              <Button
                label="Find this job online"
                variant="secondary"
                endContent={<Icon icon={ExternalLink} />}
                href={`https://www.google.com/search?q=${encodeURIComponent(`${app.role} ${app.company} job`)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`We didn't save a link for ${jobName}. Search for it online (opens in a new tab)`}
              />
            )}
            {next && (
              <Button
                label={next.label}
                variant="secondary"
                icon={<Icon icon={Check} />}
                isLoading={saving && !change}
                onClick={() => onChangeStatus(app, next.to)}
                aria-label={`${next.label}: ${jobName}`}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              label={expanded ? "Hide details" : "See details"}
              variant="ghost"
              icon={<Icon icon={expanded ? ChevronUp : ChevronDown} />}
              onClick={() => onToggleExpanded(app.num)}
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={`${expanded ? "Hide" : "See"} details for ${jobName}`}
            />
            <DropdownMenu
              alignment="end"
              menuWidth={280}
              renderTrigger={(trigger) => (
                <IconButton
                  {...trigger}
                  label={`More options for ${jobName}`}
                  tooltip="More options"
                  variant="ghost"
                  icon={<Icon icon={MoreHorizontal} />}
                />
              )}
            >
              {!actedOn && (
                <DropdownMenuItem
                  label="Not for me"
                  icon={<Icon icon={CircleMinus} />}
                  onClick={() => onChangeStatus(app, "SKIP")}
                />
              )}
              <DropdownMenuItem
                label="Change where I am…"
                icon={<Icon icon={ListChecks} />}
                onClick={() => onPickStatus(app)}
              />
              {app.reportNumber && (
                <DropdownMenuItem
                  label="Read the full write-up"
                  icon={<Icon icon={FileText} />}
                  onClick={openReport}
                />
              )}
            </DropdownMenu>
          </div>
        </div>

        {expanded && (
          // A plain section under a divider — never a box inside the job's box.
          <div id={detailsId} className="border-t border-border pt-5">
            <VStack gap={5}>
              <ApplicationInsights app={app} />
              {app.reportNumber && (
                <div>
                  <Button
                    label="Read the full write-up"
                    variant="secondary"
                    icon={<Icon icon={FileText} />}
                    onClick={openReport}
                  />
                </div>
              )}
            </VStack>
          </div>
        )}
      </article>
    </li>
  );
});

function JobList({
  apps,
  grouped,
  bestNum,
  savingNum,
  expandedNum,
  lastChange,
  onToggleExpanded,
  onChangeStatus,
  onUndo,
  onPickStatus,
  onOpenReport,
}: RowHandlers & { apps: Application[]; grouped: boolean }) {
  const groups: { status: string; apps: Application[] }[] = [];
  for (const app of apps) {
    const norm = normalizeStatus(app.status);
    const label = statusLabel(norm);
    const last = groups[groups.length - 1];
    if (grouped && last && statusLabel(last.status) === label) last.apps.push(app);
    else if (grouped || !last) groups.push({ status: norm, apps: [app] });
    else last.apps.push(app);
  }

  return (
    <VStack gap={5}>
      {groups.map((group) => (
        <VStack key={grouped ? group.status : "all"} gap={2}>
          {grouped && (
            <Text type="large" weight="semibold">
              {statusLabel(group.status)} ({group.apps.length})
            </Text>
          )}
          <Card padding={0}>
            <ul aria-label={grouped ? statusLabel(group.status) : "Jobs"}>
              {group.apps.map((app) => (
                <JobRow
                  key={app.num}
                  app={app}
                  saving={savingNum === app.num}
                  expanded={expandedNum === app.num}
                  change={lastChange?.num === app.num ? lastChange : null}
                  isBest={bestNum === app.num}
                  onToggleExpanded={onToggleExpanded}
                  onChangeStatus={onChangeStatus}
                  onUndo={onUndo}
                  onPickStatus={onPickStatus}
                  onOpenReport={onOpenReport}
                />
              ))}
            </ul>
          </Card>
        </VStack>
      ))}
    </VStack>
  );
}

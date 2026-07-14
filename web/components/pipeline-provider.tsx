"use client";

import * as React from "react";
import { Loader2, Terminal, X, ChevronDown, ChevronUp, Trash2, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { PipelineCommand } from "@/lib/pipeline";

interface RunOptions {
  /** Fired once the run finishes (success or error) — e.g. to refresh data. */
  onDone?: () => void;
}

interface PipelineContextValue {
  /** The command currently running, or null when idle. */
  running: PipelineCommand | null;
  /** Captured console output for the latest run. */
  log: string;
  /** Start a pipeline command. No-ops while another run is in flight. */
  run: (command: PipelineCommand, opts?: RunOptions) => void;
  /** Request cancellation of the in-flight run. */
  cancel: () => void;
  /** Re-open the docked console (e.g. from a "Logs" button). */
  openConsole: () => void;
  hasLog: boolean;
}

const PipelineContext = React.createContext<PipelineContextValue | null>(null);

export function usePipeline(): PipelineContextValue {
  const ctx = React.useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used within a PipelineProvider");
  return ctx;
}

function lineClass(line: string): string {
  if (/✗|\[error\]|error:|fatal/i.test(line)) return "text-ctp-red";
  if (/✅|🏁|\[done\]/.test(line)) return "text-ctp-green";
  if (/^\s*\[\d/.test(line) || /✓/.test(line)) return "text-foreground/80";
  if (/^🔍|^🌐|^📊|^💾|^🧮|Scanning|fallback/.test(line)) return "text-ctp-sky";
  if (line.startsWith("$")) return "text-ctp-yellow";
  return "text-muted-foreground";
}

/** Keep the console bounded so very chatty runs can't bloat the DOM. */
const MAX_LINES = 600;

/**
 * A single console line. Memoized so each streamed chunk only re-renders the
 * line(s) whose content changed (previously every chunk re-rendered — and
 * re-classified — the entire log).
 */
const LogLine = React.memo(function LogLine({ line }: { line: string }) {
  return <div className={cn("whitespace-pre-wrap", lineClass(line))}>{line || "\u00a0"}</div>;
});

/**
 * Owns all pipeline-run state and renders a single docked live console.
 *
 * Centralising this (vs. per-button consoles) means the Launch Pad, the
 * collapsed quick-actions strip, and any future trigger all share one "is
 * something running" source of truth and one output panel.
 */
function commandLabel(command: PipelineCommand): string {
  return command === "scan" || command === "scan:fallback" ? "Scan" : "Evaluation";
}

const POLL_INTERVAL_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface JobStatusResponse {
  status: "Queued" | "Running" | "Succeeded" | "Failed" | "Canceled";
  log: string;
  error: string | null;
  done: boolean;
}

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [running, setRunning] = React.useState<PipelineCommand | null>(null);
  const runningRef = React.useRef<PipelineCommand | null>(null);
  const jobIdRef = React.useRef<string | null>(null);
  // Bumped whenever a run starts/stops so a stale poll loop exits promptly.
  const pollGenRef = React.useRef(0);
  const [log, setLog] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);
  const logRef = React.useRef<HTMLDivElement>(null);
  const stickToBottom = React.useRef(true);

  // Auto-scroll to the newest line unless the user scrolled up.
  React.useEffect(() => {
    const el = logRef.current;
    if (el && expanded && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [log, expanded]);

  function onScroll() {
    const el = logRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  // Poll a queued/running job until it reaches a terminal state, mirroring its
  // captured log into the docked console. The heavy work runs on the worker
  // tier — this just observes the job row.
  const attach = React.useCallback(
    (jobId: string, command: PipelineCommand, opts?: RunOptions) => {
      jobIdRef.current = jobId;
      runningRef.current = command;
      setRunning(command);
      setShow(true);
      setExpanded(true);
      stickToBottom.current = true;
      const gen = ++pollGenRef.current;

      void (async () => {
        const label = commandLabel(command);
        let final: JobStatusResponse | null = null;
        while (pollGenRef.current === gen) {
          await sleep(POLL_INTERVAL_MS);
          if (pollGenRef.current !== gen) return; // superseded/canceled locally
          let res: Response;
          try {
            res = await fetch(`/api/pipeline/jobs/${jobId}`, { cache: "no-store" });
          } catch {
            continue; // transient network error — keep polling
          }
          if (res.status === 404) break;
          if (!res.ok) continue;
          const job = (await res.json()) as JobStatusResponse;
          setLog(job.log ?? "");
          if (job.done) {
            final = job;
            break;
          }
        }

        if (pollGenRef.current !== gen) return;
        runningRef.current = null;
        jobIdRef.current = null;
        setRunning(null);

        if (final?.status === "Succeeded") {
          toast.success(`${label} complete`, "Your roles are up to date.");
        } else if (final?.status === "Canceled") {
          toast.info(`${label} canceled`, "The run was stopped.");
        } else if (final) {
          toast.error(`${label} failed`, final.error ?? "Open the console for details.");
        }
        opts?.onDone?.();
      })();
    },
    [toast],
  );

  const run = React.useCallback(
    (command: PipelineCommand, opts?: RunOptions) => {
      if (runningRef.current) return;
      // Set the guard synchronously, before the enqueue round trip, so a fast
      // double-click or a slow network can't fire a second POST while the
      // button is still (visually) enabled.
      runningRef.current = command;
      setRunning(command);
      setLog("");
      const label = commandLabel(command);

      void (async () => {
        let res: Response;
        try {
          res = await fetch(`/api/pipeline/${command}`, { method: "POST" });
        } catch (err) {
          runningRef.current = null;
          setRunning(null);
          toast.error(`${label} failed`, (err as Error).message);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };

        if (res.status === 422) {
          runningRef.current = null;
          setRunning(null);
          toast.info(`${label} skipped`, data.error);
          return;
        }
        if (res.status === 429) {
          runningRef.current = null;
          setRunning(null);
          toast.info("Slow down", data.error);
          return;
        }
        if (!res.ok || !data.jobId) {
          runningRef.current = null;
          setRunning(null);
          toast.error(`${label} failed`, data.error ?? "Could not queue the run.");
          return;
        }

        setLog("$ queued — waiting for a worker…\n");
        // attach() re-sets running to the (possibly reused, per the server's
        // single-flight guard) job's own command — a no-op if it matches.
        attach(data.jobId, command, opts);
      })();
    },
    [toast, attach],
  );

  const cancel = React.useCallback(() => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    void fetch(`/api/pipeline/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => {});
    // Let the poll loop observe the terminal Canceled status for the toast.
  }, []);

  // Reattach to an in-flight run after a page reload so the console isn't lost.
  React.useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const res = await fetch("/api/pipeline/active", { cache: "no-store" });
        if (!res.ok) return;
        const { job } = (await res.json()) as {
          job: { id: string; command: PipelineCommand } | null;
        };
        if (!stale && job && !runningRef.current) attach(job.id, job.command);
      } catch {
        /* ignore — nothing to resume */
      }
    })();
    return () => {
      stale = true;
    };
  }, [attach]);

  const value = React.useMemo<PipelineContextValue>(
    () => ({ running, log, run, cancel, openConsole: () => setShow(true), hasLog: log.length > 0 }),
    [running, log, run, cancel],
  );

  const { lines, truncated } = React.useMemo(() => {
    const all = log.split("\n");
    if (all.length > MAX_LINES) {
      return { lines: all.slice(all.length - MAX_LINES), truncated: true };
    }
    return { lines: all, truncated: false };
  }, [log]);

  return (
    <PipelineContext.Provider value={value}>
      {children}

      {show && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-7xl px-2 sm:px-4">
          <div className="animate-slide-up overflow-hidden rounded-t-xl border border-border bg-card shadow-2xl">
            {/* Title bar */}
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Terminal className="h-4 w-4 text-ctp-sky" />
                <span>Pipeline output</span>
                {running ? (
                  <span className="inline-flex items-center gap-1 text-xs text-ctp-yellow">
                    <Loader2 className="h-3 w-3 animate-spin" /> running {running}…
                  </span>
                ) : (
                  log && <span className="text-xs text-ctp-green">done</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {running && (
                  <button
                    className="rounded p-1 text-ctp-red hover:bg-ctp-red/10"
                    onClick={cancel}
                    title="Stop this run"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                )}
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  onClick={() => setLog("")}
                  disabled={!log || running !== null}
                  title="Clear"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setExpanded((e) => !e)}
                  title={expanded ? "Minimize" : "Expand"}
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  onClick={() => setShow(false)}
                  disabled={running !== null}
                  title={running ? "Can't close while running" : "Close"}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Log body */}
            {expanded && (
              <div
                ref={logRef}
                onScroll={onScroll}
                className="h-[38vh] overflow-auto bg-background p-3 font-mono text-xs leading-relaxed"
              >
                {log ? (
                  <>
                    {truncated && (
                      <div className="text-muted-foreground/60">
                        … earlier output trimmed (showing last {MAX_LINES} lines)
                      </div>
                    )}
                    {lines.map((line, i) => (
                      <LogLine key={i} line={line} />
                    ))}
                  </>
                ) : (
                  <div className="text-muted-foreground">Waiting for output…</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </PipelineContext.Provider>
  );
}

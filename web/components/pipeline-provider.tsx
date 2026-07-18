"use client";

import * as React from "react";

import { useToast } from "@/components/ui/toast";
import { parseScanTelemetry } from "@/lib/scan-telemetry";
import type { PipelineCommand } from "@/lib/pipeline";

interface RunOptions {
  /** Fired once the run finishes (success or error) — e.g. to refresh data. */
  onDone?: () => void;
}

interface PipelineContextValue {
  /** The command currently running, or null when idle. */
  running: PipelineCommand | null;
  /** Captured console output for the latest run (drives progress telemetry). */
  log: string;
  /** Start a pipeline command. No-ops while another run is in flight. */
  run: (command: PipelineCommand, opts?: RunOptions) => void;
  /** Request cancellation of the in-flight run. */
  cancel: () => void;
  /** Re-open the docked console — retained for API compatibility; no-op now. */
  openConsole: () => void;
  hasLog: boolean;
  /** 0–100, derived from the run's last `Progress: n/total` log line — null
   * until that line has appeared (e.g. during scan's instant matching
   * phase, or when there's nothing to process). */
  percent: number | null;
  /** Human-readable counter to pair with `percent`, e.g. "23 of 40 roles
   * evaluated". Null under the same conditions as `percent`. */
  progressLabel: string | null;
}

const PipelineContext = React.createContext<PipelineContextValue | null>(null);

export function usePipeline(): PipelineContextValue {
  const ctx = React.useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used within a PipelineProvider");
  return ctx;
}

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

/**
 * Owns all pipeline-run state. The raw command-line console is intentionally
 * not rendered — progress is surfaced through the onboarding telemetry / toasts
 * instead. The captured `log` is still tracked so the scan screen's live
 * activity feed and counters can parse it.
 */
export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [running, setRunning] = React.useState<PipelineCommand | null>(null);
  const runningRef = React.useRef<PipelineCommand | null>(null);
  const jobIdRef = React.useRef<string | null>(null);
  // Bumped whenever a run starts/stops so a stale poll loop exits promptly.
  const pollGenRef = React.useRef(0);
  const [log, setLog] = React.useState("");

  // Poll a queued/running job until it reaches a terminal state, mirroring its
  // captured log into state. The heavy work runs on the worker tier — this just
  // observes the job row.
  const attach = React.useCallback(
    (jobId: string, command: PipelineCommand, opts?: RunOptions) => {
      jobIdRef.current = jobId;
      runningRef.current = command;
      setRunning(command);
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
          toast.error(`${label} failed`, final.error ?? "Please try again.");
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

  // Reattach to an in-flight run after a page reload so progress isn't lost.
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

  const value = React.useMemo<PipelineContextValue>(() => {
    const tel = parseScanTelemetry(log);
    const percent =
      running !== null && tel.progressTotal && tel.progressDone !== null
        ? Math.round((tel.progressDone / tel.progressTotal) * 100)
        : null;
    const progressLabel =
      running !== null && tel.progressTotal && tel.progressDone !== null
        ? running.startsWith("evaluate")
          ? `${tel.progressDone} of ${tel.progressTotal} roles evaluated`
          : `${tel.progressDone} of ${tel.progressTotal} URLs checked`
        : null;
    return {
      running,
      log,
      run,
      cancel,
      openConsole: () => {},
      hasLog: log.length > 0,
      percent,
      progressLabel,
    };
  }, [running, log, run, cancel]);

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

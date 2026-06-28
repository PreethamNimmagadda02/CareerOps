"use client";

import * as React from "react";
import { Loader2, Terminal, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { PipelineCommand } from "@/lib/pipeline";

interface RunOptions {
  /** Fired once the run finishes (success or error) — e.g. to refresh data. */
  onDone?: () => void;
}

interface PipelineContextValue {
  /** The command currently streaming, or null when idle. */
  running: PipelineCommand | null;
  /** Accumulated console output for the latest run. */
  log: string;
  /** Start a pipeline command. No-ops while another run is in flight. */
  run: (command: PipelineCommand, opts?: RunOptions) => void;
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

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [running, setRunning] = React.useState<PipelineCommand | null>(null);
  const runningRef = React.useRef<PipelineCommand | null>(null);
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

  const run = React.useCallback((command: PipelineCommand, opts?: RunOptions) => {
    if (runningRef.current) return;
    runningRef.current = command;
    setRunning(command);
    setLog("");
    setShow(true);
    setExpanded(true);
    stickToBottom.current = true;

    void (async () => {
      const label = commandLabel(command);
      let full = "";
      let ok = true;
      let status = 0;
      try {
        const res = await fetch(`/api/pipeline/${command}`, { method: "POST" });
        ok = res.ok;
        status = res.status;
        if (!res.body) {
          full += "\n[error] no response stream\n";
          setLog((l) => l + full);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          setLog((l) => l + chunk);
        }
      } catch (err) {
        ok = false;
        const chunk = `\n[error] ${(err as Error).message}\n`;
        full += chunk;
        setLog((l) => l + chunk);
      } finally {
        runningRef.current = null;
        setRunning(null);

        // Surface the outcome as a toast so feedback isn't buried in the console.
        const exit = full.match(/exited with code (\d+)/);
        const failed = !ok || /\[error\]/.test(full) || (exit !== null && exit[1] !== "0");
        if (status === 422) {
          // Pre-flight guard (e.g. missing keywords/profile) — informative, not a crash.
          const reason = full.split("\n").map((s) => s.trim()).find(Boolean);
          toast.info(`${label} skipped`, reason);
        } else if (failed) {
          const reason = full
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .reverse()
            .find((l) => /error|fail/i.test(l));
          toast.error(`${label} failed`, reason ?? "Open the console for details.");
        } else {
          toast.success(`${label} complete`, "Your roles are up to date.");
        }

        opts?.onDone?.();
      }
    })();
  }, [toast]);

  const value = React.useMemo<PipelineContextValue>(
    () => ({ running, log, run, openConsole: () => setShow(true), hasLog: log.length > 0 }),
    [running, log, run],
  );

  const lines = React.useMemo(() => log.split("\n"), [log]);

  return (
    <PipelineContext.Provider value={value}>
      {children}

      {show && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-7xl px-2 sm:px-4">
          <div className="overflow-hidden rounded-t-lg border border-border bg-card shadow-2xl">
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
                  lines.map((line, i) => (
                    <div key={i} className={cn("whitespace-pre-wrap", lineClass(line))}>
                      {line || "\u00a0"}
                    </div>
                  ))
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

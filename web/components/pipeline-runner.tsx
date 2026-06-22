"use client";

import * as React from "react";
import { Play, Loader2, Terminal, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineCommand } from "@/lib/pipeline";

const COMMANDS: { command: PipelineCommand; label: string; description: string }[] = [
  { command: "scan:fallback", label: "Scan", description: "Discover roles (APIs + browser fallback)" },
  { command: "evaluate", label: "Evaluate 5", description: "Evaluate up to 5 pending jobs" },
  { command: "evaluate:all", label: "Evaluate all", description: "Evaluate up to 50 pending jobs" },
];

function lineClass(line: string): string {
  if (/✗|\[error\]|error:|fatal/i.test(line)) return "text-ctp-red";
  if (/✅|🏁|\[done\]/.test(line)) return "text-ctp-green";
  if (/^\s*\[\d/.test(line) || /✓/.test(line)) return "text-foreground/80";
  if (/^🔍|^🌐|^📊|^💾|^🧮|Scanning|fallback/.test(line)) return "text-ctp-sky";
  if (line.startsWith("$")) return "text-ctp-yellow";
  return "text-muted-foreground";
}

export function PipelineRunner({ onComplete }: { onComplete?: () => void }) {
  const [running, setRunning] = React.useState<PipelineCommand | null>(null);
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

  async function run(command: PipelineCommand) {
    if (running) return;
    setRunning(command);
    setLog("");
    setShow(true);
    setExpanded(true);
    stickToBottom.current = true;
    try {
      const res = await fetch(`/api/pipeline/${command}`, { method: "POST" });
      if (!res.body) {
        setLog((l) => l + "\n[error] no response stream\n");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setLog((l) => l + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      setLog((l) => l + `\n[error] ${(err as Error).message}\n`);
    } finally {
      setRunning(null);
      onComplete?.();
    }
  }

  const lines = React.useMemo(() => log.split("\n"), [log]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {COMMANDS.map((c) => (
          <Button
            key={c.command}
            variant={c.command === "scan:fallback" ? "default" : "secondary"}
            size="sm"
            disabled={running !== null}
            onClick={() => run(c.command)}
            title={c.description}
          >
            {running === c.command ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {c.label}
          </Button>
        ))}
        {log && !show && (
          <Button variant="ghost" size="sm" onClick={() => setShow(true)}>
            <Terminal className="h-4 w-4" /> Logs
          </Button>
        )}
      </div>

      {/* Docked live console */}
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
    </>
  );
}

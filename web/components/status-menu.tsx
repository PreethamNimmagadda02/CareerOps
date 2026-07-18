"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { normalizeStatus, statusLabel, STATUS_OPTIONS } from "@/lib/status";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  interview: "bg-ctp-green",
  offer: "bg-ctp-green",
  applied: "bg-ctp-sky",
  responded: "bg-ctp-blue",
  evaluated: "bg-muted-foreground",
  skip: "bg-ctp-red",
  rejected: "bg-muted-foreground/60",
  discarded: "bg-muted-foreground/60",
};

/**
 * Click-to-open status picker. Replaces the cramped native <select>: the badge
 * itself is the trigger, and the menu shows colour-coded options with the
 * current one checked.
 */
export function StatusSelect({
  status,
  saving,
  onChange,
}: {
  status: string;
  saving: boolean;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const norm = normalizeStatus(status);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change status"
        className="inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <StatusBadge status={norm} />
        {saving ? (
          <Spinner className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown
            className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-1 w-44 origin-top-left animate-scale-in overflow-hidden rounded-md border border-border bg-card p-1 shadow-xl"
        >
          {STATUS_OPTIONS.map((s) => {
            const sn = normalizeStatus(s);
            const active = sn === norm;
            return (
              <button
                key={s}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
                  if (!active) onChange(s);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                  active && "bg-accent/60",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[sn] ?? "bg-muted-foreground")} />
                <span className="flex-1">{statusLabel(sn)}</span>
                {active && <Check className="h-3.5 w-3.5 text-ctp-green" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

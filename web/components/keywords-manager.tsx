"use client";

import * as React from "react";
import { Loader2, Plus, Tag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type Kind = "positive" | "negative";

interface KeywordSet {
  positive: string[];
  negative: string[];
}

/** Suggested keywords users can one-click add. They can also type their own. */
const SUGGESTIONS: Record<Kind, string[]> = {
  positive: [
    "software engineer",
    "backend",
    "frontend",
    "full stack",
    "platform",
    "infrastructure",
    "data engineer",
    "machine learning",
    "devops",
    "site reliability",
  ],
  negative: [
    "senior",
    "staff",
    "principal",
    "lead",
    "manager",
    "director",
    "intern",
    "contract",
    "sales",
    "clearance",
  ],
};

const KIND_META: Record<Kind, { label: string; hint: string; chip: string }> = {
  positive: {
    label: "Include keywords",
    hint: "Roles whose title matches one of these are kept.",
    chip: "border-ctp-green/40 bg-ctp-green/10 text-ctp-green",
  },
  negative: {
    label: "Exclude keywords",
    hint: "Roles whose title matches any of these are skipped.",
    chip: "border-ctp-red/40 bg-ctp-red/10 text-ctp-red",
  },
};

export function KeywordsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [keywords, setKeywords] = React.useState<KeywordSet>({ positive: [], negative: [] });
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keywords", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load keywords");
      setKeywords(data.keywords as KeywordSet);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function mutate(method: "POST" | "DELETE", kind: Kind, value: string) {
    const key = `${method}:${kind}:${value}`;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/keywords", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setKeywords(data.keywords as KeywordSet);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filter keywords"
      subtitle="Choose suggested keywords or create your own. Used by Scan to keep or skip roles by title."
      className="max-w-2xl"
    >
      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading keywords…
        </div>
      ) : (
        <div className="space-y-6">
          {(["positive", "negative"] as Kind[]).map((kind) => (
            <KindSection
              key={kind}
              kind={kind}
              values={keywords[kind]}
              busy={busy}
              onAdd={(value) => mutate("POST", kind, value)}
              onRemove={(value) => mutate("DELETE", kind, value)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function KindSection({
  kind,
  values,
  busy,
  onAdd,
  onRemove,
}: {
  kind: Kind;
  values: string[];
  busy: string | null;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const meta = KIND_META[kind];
  const has = (v: string) => values.includes(v.trim().toLowerCase());

  const suggestions = SUGGESTIONS[kind].filter((s) => !has(s));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim().toLowerCase();
    if (!value || has(value)) {
      setDraft("");
      return;
    }
    onAdd(value);
    setDraft("");
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{meta.label}</h3>
        <span className="text-xs text-muted-foreground">{values.length}</span>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{meta.hint}</p>

      {/* Current keywords */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">No keywords yet.</span>
        )}
        {values.map((value) => {
          const removing = busy === `DELETE:${kind}:${value}`;
          return (
            <span
              key={value}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                meta.chip,
              )}
            >
              {value}
              <button
                type="button"
                onClick={() => onRemove(value)}
                disabled={removing}
                className="rounded-full hover:bg-black/10 disabled:opacity-50"
                aria-label={`Remove ${value}`}
              >
                {removing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </span>
          );
        })}
      </div>

      {/* Create your own */}
      <form onSubmit={submit} className="mb-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add a custom ${kind} keyword…`}
          maxLength={80}
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!draft.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Suggestions:</span>
          {suggestions.map((s) => {
            const adding = busy === `POST:${kind}:${s}`;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onAdd(s)}
                disabled={adding}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {s}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

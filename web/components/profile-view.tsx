"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Check,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User as UserIcon,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { buildMatchingPrefs } from "@/lib/matching-defaults";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id: string; name: string | null; email: string | null;
  image: string | null; resumeKey: string | null; resumeUpdatedAt: string | null;
}

interface MatchingData {
  role_domains?: string[];
  role_nouns?: string[];
  include_titles?: string[];
  exclude_titles?: string[];
  strong_titles?: string[];
  seniority_exclusions?: string[];
  preferred_locations?: string[];
  remote_ok?: boolean;
  eligible_locations?: string[];
}

interface ProfileData {
  candidate?: { full_name?: string; email?: string; phone?: string; location?: string; linkedin?: string; portfolio_url?: string; github?: string; twitter?: string };
  target_roles?: { primary?: string[]; archetypes?: Array<{ name: string; level: string; fit: string }> };
  narrative?: { headline?: string; exit_story?: string; superpowers?: string[]; proof_points?: Array<{ name: string; url?: string; hero_metric: string }> };
  compensation?: { target_range?: string; currency?: string; minimum?: string; location_flexibility?: string };
  location?: { city?: string; country?: string; timezone?: string; visa_status?: string; onsite_availability?: string };
  matching?: MatchingData;
}

interface CvData {
  summary?: string;
  skills?: Array<{ category: string; items: string[] }>;
  experience?: Array<{ company: string; role: string; location: string; period: string; highlights: string[] }>;

}

// ── Profile completeness ─────────────────────────────────────────────────────
//
// Lightweight client-side mirror of the server-side readiness checks
// (src/lib/profile-validation.ts). Kept intentionally simple — this only
// drives UI hints (progress bar, "what's missing" chips); the server remains
// the source of truth for whether a scan/evaluation is actually allowed to run.

function isFilled(s: string | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function hasRoleIndicator(m: MatchingData | undefined): boolean {
  return Boolean(m?.role_domains?.length || m?.role_nouns?.length || m?.include_titles?.length);
}

function hasLocationIndicator(m: MatchingData | undefined): boolean {
  return Boolean(
    m?.preferred_locations?.length ||
    m?.remote_ok
  );
}

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

function buildChecklist(p: ProfileData, c: CvData, resumeKey: string | null): ChecklistItem[] {
  return [
    { id: "section-basics", label: "Upload your résumé", done: Boolean(resumeKey) },
    {
      id: "section-basics",
      label: "Personal info",
      done: isFilled(p.candidate?.full_name) && isFilled(p.candidate?.location),
    },
    {
      id: "section-career",
      label: "Career profile",
      done: isFilled(p.narrative?.headline) && (p.target_roles?.primary?.length ?? 0) > 0,
    },
    {
      id: "section-matching",
      label: "Job matching preferences",
      done: hasRoleIndicator(p.matching) && hasLocationIndicator(p.matching),
    },
    {
      // "Professional summary" lives inside the Career Profile card (it's the
      // same text as narrative.exit_story — see startCareer/onSave below).
      id: "section-career",
      label: "Professional summary",
      done: isFilled(c.summary) || (c.experience?.length ?? 0) > 0,
    },
    { id: "section-skills", label: "Skills", done: (c.skills?.length ?? 0) > 0 },
  ];
}

const SECTION_NAV: { id: string; label: string }[] = [
  { id: "section-basics", label: "Basics" },
  { id: "section-career", label: "Career" },
  { id: "section-work", label: "Preferences" },
  { id: "section-matching", label: "Job matching" },
  { id: "section-experience", label: "Experience" },
  { id: "section-skills", label: "Skills" },
];

// Icons for the quick nav – matches the Section icons used below.
const SECTION_ICONS: Record<string, React.ReactNode> = {
  "section-basics": <UserIcon className="h-4 w-4" />,
  "section-career": <Briefcase className="h-4 w-4" />,
  "section-work": <MapPin className="h-4 w-4" />,
  "section-matching": <Target className="h-4 w-4" />,
  "section-experience": <Briefcase className="h-4 w-4" />,
  "section-skills": <Zap className="h-4 w-4" />,
};

// ── Primitives ─────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed";

function Field({ label, value, editing, onChange, placeholder, multiline = false, type = "text", helpText }: {
  label: string; value: string; editing: boolean;
  onChange: (v: string) => void; placeholder?: string; multiline?: boolean; type?: string; helpText?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {label}
        {helpText && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 font-normal">
            {helpText}
          </span>
        )}
      </label>
      {editing ? (
        <div className="relative">
          {multiline
            ? <textarea rows={4} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? label} className={cn(inputCls, "resize-y min-h-[100px]")} />
            : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? label} className={inputCls} autoComplete="off" />}
          {value && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 text-xs">{value.length} chars</span>}
        </div>
      ) : (
        <div className="p-3 rounded-md bg-muted/30 border border-border min-h-[44px]">
          <p className="text-sm leading-relaxed text-foreground">
            {value
              ? value.startsWith("http")
                ? <a href={value} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline flex items-center gap-1">
                  {value}
                  <ExternalLink className="h-3 w-3" />
                </a>
                : value
              : <span className="text-muted-foreground italic">Not set — click Edit to add</span>}
          </p>
        </div>
      )}
    </div>
  );
}

/** Maps a `ChipsField` autocomplete source to its API route. */
const AUTOCOMPLETE_ENDPOINTS = {
  locations: "/api/locations",
  "job-titles": "/api/job-titles",
} as const;

/**
 * ChipsField — add / remove string tags in a text input. When `autocomplete`
 * is set, the component fetches suggestions from the matching public-data
 * API route as the user types (see `AUTOCOMPLETE_ENDPOINTS`).
 */
function ChipsField({ label, values, editing, onChange, placeholder, helpText, maxItems, autocomplete }: {
  label: string; values: string[]; editing: boolean;
  onChange: (v: string[]) => void; placeholder?: string; helpText?: string; maxItems?: number;
  autocomplete?: keyof typeof AUTOCOMPLETE_ENDPOINTS;
}) {
  const [draft, setDraft] = React.useState("");
  const [autoList, setAutoList] = React.useState<string[]>([]);
  const [autoIdx, setAutoIdx] = React.useState(-1); // keyboard nav index
  const [autocompleteOpen, setAutocompleteOpen] = React.useState(false);
  const isAtMax = Boolean(maxItems && values.length >= maxItems);

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Fetch suggestions from the matching public API when draft has 2+ chars.
  React.useEffect(() => {
    if (!editing || draft.trim().length < 2 || !autocomplete) {
      setAutoList([]);
      setAutoIdx(-1);
      setAutocompleteOpen(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const endpoint = AUTOCOMPLETE_ENDPOINTS[autocomplete];

    // Debounce slightly so we don't hammer the API on every keystroke.
    const timer = setTimeout(() => {
      fetch(`${endpoint}?q=${encodeURIComponent(draft.trim())}`, {
        signal: controller.signal,
      })
        .then(r => (r.ok ? r.json() : null))
        .then((data: string[] | null) => {
          if (cancelled || !data) return;
          setAutoList(data);
          setAutoIdx(-1);
          setAutocompleteOpen(data.length > 0);
        })
        .catch(() => { setAutoList([]); setAutocompleteOpen(false); });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, editing, autocomplete]);

  function selectSuggestion(v: string) {
    if (!v || values.includes(v) || isAtMax) return;
    onChange([...values, v]);
    setDraft("");
    setAutoList([]);
    setAutocompleteOpen(false);
    inputRef.current?.focus();
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    // If a suggestion is highlighted via keyboard, select it.
    if (autoIdx >= 0 && autoIdx < autoList.length) {
      selectSuggestion(autoList[autoIdx]);
      return;
    }
    const v = draft.trim();
    if (!v || values.includes(v) || isAtMax) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
    setAutoList([]);
    setAutocompleteOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && autoList.length > 0) {
      e.preventDefault();
      setAutoIdx(i => Math.min(i + 1, autoList.length - 1));
    } else if (e.key === "ArrowUp" && autoList.length > 0) {
      e.preventDefault();
      setAutoIdx(i => (i <= 0 ? -1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(e as unknown as React.FormEvent);
    } else if (e.key === "Escape") {
      setDraft("");
      setAutoList([]);
      setAutocompleteOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {label}
        {helpText && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 font-normal">
            {helpText}
          </span>
        )}
        {maxItems && <span className="text-xs text-muted-foreground/60">{values.length}/{maxItems}</span>}
      </label>
      <div className="flex flex-wrap gap-1.5 min-h-[44px]">
        {values.length === 0 && !editing && (
          <span className="text-sm text-muted-foreground italic flex items-center h-full">No entries yet — click Edit to add</span>
        )}
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-accent/50">
            {v}
            {editing && (
              <button type="button" onClick={() => onChange(values.filter(x => x !== v))} className="hover:text-destructive hover:bg-destructive/10 rounded-full p-0.5" aria-label={`Remove ${v}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {editing && (
        <div className="relative">
          <form onSubmit={add} className="flex gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={e => { setDraft(e.target.value); setAutoIdx(-1); }}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (autoList.length > 0) setAutocompleteOpen(true); }}
              onBlur={() => { setTimeout(() => setAutocompleteOpen(false), 150); }}
              placeholder={placeholder ?? `Add ${label.toLowerCase()}…`}
              disabled={isAtMax}
              autoComplete="off"
              role={autocomplete ? "combobox" : undefined}
              aria-expanded={autocompleteOpen ? "true" : "false"}
              aria-autocomplete={autocomplete ? "list" : undefined}
              aria-controls={autocomplete ? `${label}-autocomplete-list` : undefined}
              className="h-8 flex-1 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <button type="submit" disabled={!draft.trim() || isAtMax} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors">
              <Plus className="h-4 w-4" /> Add
            </button>
          </form>

          {autocompleteOpen && autoList.length > 0 && (
            <ul
              id={`${label}-autocomplete-list`}
              role="listbox"
              className="absolute bottom-full left-0 z-50 mb-1 max-h-[240px] w-[min(calc(100vw-3rem),420px)] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl ring-1 ring-black/5"
            >
              {autoList.map((item, idx) => (
                <li
                  key={item}
                  role="option"
                  aria-selected={autoIdx === idx}
                  onMouseDown={() => selectSuggestion(item)}
                  onMouseEnter={() => setAutoIdx(idx)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm cursor-pointer transition-colors break-words",
                    autoIdx === idx
                      ? "bg-accent text-foreground font-medium"
                      : "text-foreground hover:bg-accent/70",
                  )}
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ id, title, icon, badge, editing, saving, onEdit, onSave, onCancel, error, children, description }: {
  id?: string; title: string; icon: React.ReactNode; badge?: React.ReactNode; editing: boolean; saving: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void; error?: string | null; children: React.ReactNode; description?: string;
}) {
  return (
    <div id={id} className="scroll-mt-28 rounded-xl border border-border bg-card p-5 sm:p-6 space-y-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            {badge && <span className="inline-block mt-1">{badge}</span>}
          </div>
        </div>
        {!editing ? (
          <button onClick={onEdit} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors whitespace-nowrap">
            <Pencil className="h-4 w-4" /> Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onSave} disabled={saving} className="min-w-[80px]">
              {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} className="min-w-[80px]">
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
        )}
      </div>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <div className="pt-1">{children}</div>
    </div>
  );
}

// ── Array entry card (wraps an editable row in edit mode) ──────────────────────

function EntryCard({ editing, onRemove, children }: {
  editing: boolean; onRemove: () => void; children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border border-border p-3", editing && "bg-background/50")}>
      {children}
      {editing && (
        <div className="mt-2 flex justify-end">
          <button onClick={onRemove} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/50 hover:bg-accent/30 hover:text-foreground">
      <Plus className="h-3 w-3" /> {label}
    </button>
  );
}

// ── Resume card ────────────────────────────────────────────────────────────────

function ResumeSection({ resumeKey, resumeUpdatedAt, onUploaded, onExtracted }: {
  resumeKey: string | null; resumeUpdatedAt: string | null;
  onUploaded: (key: string, updatedAt: string) => void;
  onExtracted: (profile: ProfileData | null, cv: CvData | null) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [extracting, setExtracting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function runExtract(auto: boolean) {
    setExtracting(true);
    setError(null);
    setNotice(auto ? "Reading your résumé and filling in your details…" : null);
    try {
      const res = await fetch("/api/profile/resume/extract", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      onExtracted((data.profile ?? null) as ProfileData | null, (data.cv ?? null) as CvData | null);
      setNotice("Filled in your profile from the résumé. Review and edit any section as needed.");
    } catch (err) {
      setNotice(null);
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleFile(file: File) {
    setError(null); setNotice(null); setUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/profile/resume", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUploaded(data.resumeKey as string, data.resumeUpdatedAt as string);
      // Auto-extract right after a successful upload.
      void runExtract(true);
    } catch (err) { setError((err as Error).message); }
    finally { setUploading(false); }
  }

  async function handleDelete() {
    if (!confirm("Remove your uploaded resume?")) return;
    setDeleting(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/profile/resume", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onUploaded("", "");
    } catch (err) { setError((err as Error).message); }
    finally { setDeleting(false); }
  }

  const ext = resumeKey ? (resumeKey.split(".").pop() ?? "pdf") : "pdf";
  const busy = uploading || extracting;

  return (
    <div id="section-resume" className="scroll-mt-28 rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resume / CV File</h2>
        {!resumeKey && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Start here
          </span>
        )}
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      {notice && (
        <p className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
          {extracting && <Spinner className="h-3 w-3 shrink-0 text-primary" />}
          {notice}
        </p>
      )}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={cn("relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/30")}
      >
        {busy && (
          <div className="pointer-events-none absolute inset-0 animate-shimmer bg-[linear-gradient(115deg,transparent_30%,hsl(var(--primary)/0.14)_50%,transparent_70%)] bg-[length:220%_100%]" />
        )}
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
        {uploading ? <Spinner className="h-7 w-7 text-primary" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
        <div>
          <p className="text-sm font-medium">{uploading ? "Uploading…" : "Click or drag to upload"}</p>
          <p className="text-xs text-muted-foreground">PDF · DOC · DOCX · Max 10 MB · auto-fills your profile</p>
        </div>
      </div>
      {resumeKey && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-ctp-blue" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">resume.{ext}</p>
              <p className="text-xs text-muted-foreground">Uploaded {fmt(resumeUpdatedAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => void runExtract(false)} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Re-read the résumé and fill in any empty fields">
              {extracting ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              Auto-fill
            </button>
            <a href="/api/profile/resume" download={`resume.${ext}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Download">
              <Download className="h-4 w-4" />
            </a>
            <button onClick={handleDelete} disabled={deleting || extracting}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Remove">
              {deleting ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Archetype = { name: string; level: string; fit: string };
type ProofPoint = { name: string; url: string; hero_metric: string };
type Experience = { company: string; role: string; location: string; period: string; highlights: string[] };
type SkillGroup = { category: string; items: string[] };

// ── section edit states ────────────────────────────────────────────────────
type SectionKey = "account" | "personal" | "career" | "work" | "matching" | "experience" | "skills";

const SECTION_LABEL: Record<SectionKey, string> = {
  account: "Account",
  personal: "Personal info",
  career: "Career profile",
  work: "Work preferences",
  matching: "Job matching",
  experience: "Work experience",
  skills: "Skills",
};

export function ProfileView() {
  const toast = useToast();
  const [user, setUser] = React.useState<UserData | null>(null);
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [cv, setCv] = React.useState<CvData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<string>(SECTION_NAV[0].id);
  const navRef = React.useRef<HTMLDivElement>(null);

  const [editing, setEditing] = React.useState<Partial<Record<SectionKey, boolean>>>({});
  const [saving, setSaving] = React.useState<Partial<Record<SectionKey, boolean>>>({});
  const [errors, setErrors] = React.useState<Partial<Record<SectionKey, string | null>>>({});

  // ── draft states ───────────────────────────────────────────────────────────
  // personal
  const [draftFullName, setDraftFullName] = React.useState("");
  const [draftPhone, setDraftPhone] = React.useState("");
  const [draftLocation, setDraftLocation] = React.useState("");
  const [draftLinkedin, setDraftLinkedin] = React.useState("");
  const [draftGithub, setDraftGithub] = React.useState("");
  const [draftPortfolio, setDraftPortfolio] = React.useState("");
  // career
  const [draftHeadline, setDraftHeadline] = React.useState("");
  const [draftExitStory, setDraftExitStory] = React.useState("");
  const [draftRoles, setDraftRoles] = React.useState<string[]>([]);
  const [draftSuperpowers, setDraftSuperpowers] = React.useState<string[]>([]);
  const [draftArchetypes, setDraftArchetypes] = React.useState<Archetype[]>([]);
  const [draftProofPoints, setDraftProofPoints] = React.useState<ProofPoint[]>([]);
  // work
  const [draftCompRange, setDraftCompRange] = React.useState("");
  const [draftCompMin, setDraftCompMin] = React.useState("");
  const [draftCurrency, setDraftCurrency] = React.useState("");
  const [draftLocFlex, setDraftLocFlex] = React.useState("");
  const [draftTimezone, setDraftTimezone] = React.useState("");
  const [draftVisaStatus, setDraftVisaStatus] = React.useState("");
  // matching (drives the job-scan matchers — expanded via buildMatchingPrefs)
  const [draftTitles, setDraftTitles] = React.useState<string[]>([]);
  const [draftPrefLocations, setDraftPrefLocations] = React.useState<string[]>([]);
  const [draftEligibleLocations, setDraftEligibleLocations] = React.useState<string[]>([]);
  const [draftRemoteOk, setDraftRemoteOk] = React.useState(true);
  // cv
  const [draftExperience, setDraftExperience] = React.useState<Experience[]>([]);
  const [draftSkills, setDraftSkills] = React.useState<SkillGroup[]>([]);

  // ── load ───────────────────────────────────────────────────────────────────

  const load = React.useCallback(async () => {
    setLoading(true); setPageError(null);
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setUser(data.user as UserData);
      setProfile((data.profile as ProfileData | null) ?? null);
      setCv((data.cv as CvData | null) ?? null);
    } catch (err) { setPageError((err as Error).message); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  // Only one section is rendered at a time (tab-style navigation). Whenever
  // the active tab changes: reset scroll to the top of the page, and make
  // sure the corresponding nav button is fully visible in the (horizontally
  // scrollable) quick-nav bar.
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    const activeBtn = navRef.current?.querySelector('[aria-current="true"]') as HTMLElement | null;
    activeBtn?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeSection]);

  // ── save helper ────────────────────────────────────────────────────────────

  async function save(section: SectionKey, body: Record<string, unknown>) {
    setSaving(s => ({ ...s, [section]: true }));
    setErrors(e => ({ ...e, [section]: null }));
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setUser(data.user as UserData);
      setProfile((data.profile as ProfileData | null) ?? null);
      setCv((data.cv as CvData | null) ?? null);
      setEditing(e => ({ ...e, [section]: false }));
      toast.success("Saved", `${SECTION_LABEL[section]} updated.`);
    } catch (err) {
      setErrors(e => ({ ...e, [section]: (err as Error).message }));
      toast.error("Couldn't save", (err as Error).message);
    } finally {
      setSaving(s => ({ ...s, [section]: false }));
    }
  }

  function startEdit(section: SectionKey) {
    setErrors(e => ({ ...e, [section]: null }));
    setEditing(e => ({ ...e, [section]: true }));
  }
  function cancelEdit(section: SectionKey) {
    setErrors(e => ({ ...e, [section]: null }));
    setEditing(e => ({ ...e, [section]: false }));
  }

  // ── section start helpers (populate drafts) ────────────────────────────────

  function startAccount() {
    startEdit("account");
  }
  function startPersonal() {
    const c = profile?.candidate ?? {};
    setDraftFullName(c.full_name ?? ""); setDraftPhone(c.phone ?? "");
    setDraftLocation(c.location ?? ""); setDraftLinkedin(c.linkedin ?? "");
    setDraftGithub(c.github ?? ""); setDraftPortfolio(c.portfolio_url ?? "");
    startEdit("personal");
  }
  function startCareer() {
    const n = profile?.narrative ?? {}; const tr = profile?.target_roles ?? {};
    setDraftHeadline(n.headline ?? "");
    // "Professional summary" is shared with cv.summary (see onSave below) —
    // fall back to it so a summary written before this merge isn't hidden.
    setDraftExitStory(n.exit_story || cv?.summary || "");
    setDraftRoles(tr.primary ?? []); setDraftSuperpowers(n.superpowers ?? []);
    setDraftArchetypes((tr.archetypes ?? []).map(a => ({ name: a.name ?? "", level: a.level ?? "", fit: a.fit ?? "primary" })));
    setDraftProofPoints((n.proof_points ?? []).map(p => ({ name: p.name ?? "", url: p.url ?? "", hero_metric: p.hero_metric ?? "" })));
    startEdit("career");
  }
  function startWork() {
    const c = profile?.compensation ?? {}; const l = profile?.location ?? {};
    setDraftCompRange(c.target_range ?? ""); setDraftCompMin(c.minimum ?? "");
    setDraftCurrency(c.currency ?? "");
    // Flexibility and onsite-availability are now one field — merge them so
    // anything already saved under the old, separate field isn't hidden.
    setDraftLocFlex([c.location_flexibility, l.onsite_availability].filter(Boolean).join(" · "));
    setDraftTimezone(l.timezone ?? ""); setDraftVisaStatus(l.visa_status ?? "");
    startEdit("work");
  }
  function startMatching() {
    const m = profile?.matching ?? {};
    setDraftTitles(m.include_titles ?? []);
    // Load eligible locations if present (new field).
    setDraftEligibleLocations(m.eligible_locations ?? []);
    setDraftPrefLocations(m.preferred_locations ?? []);
    setDraftRemoteOk(m.remote_ok ?? true);
    startEdit("matching");
  }
  function startExperience() {
    setDraftExperience((cv?.experience ?? []).map(e => ({ ...e, highlights: [...e.highlights] })));
    startEdit("experience");
  }
  function startSkills() {
    setDraftSkills((cv?.skills ?? []).map(s => ({ category: s.category, items: [...s.items] })));
    startEdit("skills");
  }

  // ── renders ────────────────────────────────────────────────────────────────

  const checklist = React.useMemo(
    () => buildChecklist(profile ?? {}, cv ?? {}, user?.resumeKey ?? null),
    [profile, cv, user?.resumeKey],
  );
  const completedCount = checklist.filter(i => i.done).length;
  const completionPct = Math.round((completedCount / checklist.length) * 100);
  const matchingComplete = checklist.find(i => i.id === "section-matching")?.done ?? false;

  if (loading) return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-5 p-4 sm:p-6">
      <Skeleton className="h-4 w-36" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-1.5 w-full" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 flex-1 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
  if (pageError) return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{pageError}</div>
    </div>
  );

  const p = profile ?? {};
  const c = cv ?? {};
  const isEditing = (s: SectionKey) => editing[s] ?? false;
  const isSaving = (s: SectionKey) => saving[s] ?? false;
  const sectionError = (s: SectionKey) => errors[s] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          {user?.name ? `Hi ${user.name.split(" ")[0]} — keep this current so we can match and score roles for you.` : "Keep this current so we can match and score roles for you."}
        </p>
      </div>

      {/* ── Profile completeness ── */}
      {completionPct < 100 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Profile completeness</p>
            <p className="text-sm text-muted-foreground">{completedCount}/{checklist.length} · {completionPct}%</p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {checklist.filter(i => !i.done).map(i => (
              <button key={i.id} type="button" onClick={() => setActiveSection(i.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent">
                <AlertCircle className="h-3 w-3 text-muted-foreground" /> {i.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick section nav ── */}
      <nav
        aria-label="Profile sections"
        ref={navRef}
        className="sticky top-14 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-card/95 shadow-sm px-4 py-2 backdrop-blur-sm sm:-mx-0 sm:rounded-lg sm:border sm:px-2"
      >
        {SECTION_NAV.map(s => (
          <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
            aria-current={activeSection === s.id ? "true" : undefined}
            className={cn(
              "flex-1 flex justify-center shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeSection === s.id
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}>
            <span className="flex items-center gap-1">{SECTION_ICONS[s.id]}{s.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Basics: account, personal info, then résumé ── */}
      {activeSection === "section-basics" && (
        <div className="space-y-5">
          <Section id="section-account" title="Personal Info" icon={<UserIcon className="h-4 w-4" />}
            editing={isEditing("account") || isEditing("personal")} saving={isSaving("account") || isSaving("personal")} error={sectionError("account") || sectionError("personal")}
            onEdit={() => { startAccount(); startPersonal(); }}
            onSave={() => { save("account", { name: draftFullName }); save("personal", { profile: { candidate: { ...(p.candidate ?? {}), full_name: draftFullName, phone: draftPhone, location: draftLocation, linkedin: draftLinkedin, github: draftGithub, portfolio_url: draftPortfolio } } }); }}
            onCancel={() => { cancelEdit("account"); cancelEdit("personal"); }}>
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                {user?.image
                  ? <img src={user.image} alt={user.name ? `${user.name}'s avatar` : "Profile avatar"} className="h-16 w-16 shrink-0 rounded-full border border-border" />
                  : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-muted"><UserIcon className="h-8 w-8 text-muted-foreground" /></span>}
                <dl className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Email" value={user?.email ?? "—"} editing={false} onChange={() => { }} />
                </dl>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name" value={isEditing("personal") ? draftFullName : (p.candidate?.full_name ?? "")} editing={isEditing("personal")} onChange={setDraftFullName} placeholder="Jane Smith" />
                <Field label="Phone" value={isEditing("personal") ? draftPhone : (p.candidate?.phone ?? "")} editing={isEditing("personal")} onChange={setDraftPhone} placeholder="+1 (555) 000-0000" type="tel" />
                <Field label="Location" value={isEditing("personal") ? draftLocation : (p.candidate?.location ?? "")} editing={isEditing("personal")} onChange={setDraftLocation} placeholder="San Francisco, CA" />
                <Field label="LinkedIn" value={isEditing("personal") ? draftLinkedin : (p.candidate?.linkedin ?? "")} editing={isEditing("personal")} onChange={setDraftLinkedin} placeholder="https://linkedin.com/in/..." type="url" />
                <Field label="GitHub" value={isEditing("personal") ? draftGithub : (p.candidate?.github ?? "")} editing={isEditing("personal")} onChange={setDraftGithub} placeholder="https://github.com/..." type="url" />
                <Field label="Portfolio / website" value={isEditing("personal") ? draftPortfolio : (p.candidate?.portfolio_url ?? "")} editing={isEditing("personal")} onChange={setDraftPortfolio} placeholder="https://..." type="url" />
              </div>
            </div>
          </Section>

          <ResumeSection
            resumeKey={user?.resumeKey ?? null} resumeUpdatedAt={user?.resumeUpdatedAt ?? null}
            onUploaded={(key, updatedAt) => setUser(u => u ? { ...u, resumeKey: key || null, resumeUpdatedAt: updatedAt || null } : u)}
            onExtracted={(newProfile, newCv) => { setProfile(newProfile); setCv(newCv); }}
          />
        </div>
      )}

      {/* ── Career Profile ── */}
      {activeSection === "section-career" && (
        <Section id="section-career" title="Career Profile" icon={<Briefcase className="h-4 w-4" />}
          editing={isEditing("career")} saving={isSaving("career")} error={sectionError("career")}
          onEdit={startCareer}
          onSave={() => save("career", {
            profile: {
              narrative: { ...(p.narrative ?? {}), headline: draftHeadline, exit_story: draftExitStory, superpowers: draftSuperpowers, proof_points: draftProofPoints.map(pp => ({ name: pp.name, url: pp.url || undefined, hero_metric: pp.hero_metric })) },
              target_roles: { ...(p.target_roles ?? {}), primary: draftRoles, archetypes: draftArchetypes },
            },
            // Same text as the profile's "Professional summary" — kept in sync
            // with cv.summary so it also satisfies the CV-readiness check.
            cv: { summary: draftExitStory },
          })}
          onCancel={() => cancelEdit("career")}>
          <div className="space-y-4">
            <Field label="Headline" value={isEditing("career") ? draftHeadline : (p.narrative?.headline ?? "")} editing={isEditing("career")} onChange={setDraftHeadline} placeholder="e.g. Senior Software Engineer · AI/ML" />
            <Field label="Professional summary" value={isEditing("career") ? draftExitStory : (p.narrative?.exit_story ?? "")} editing={isEditing("career")} onChange={setDraftExitStory} placeholder="Your background, motivations, and what you're looking for…" multiline />
            <ChipsField label="Target roles" values={isEditing("career") ? draftRoles : (p.target_roles?.primary ?? [])} editing={isEditing("career")} onChange={setDraftRoles} placeholder="e.g. Software Engineer" />
            <ChipsField label="Superpowers" values={isEditing("career") ? draftSuperpowers : (p.narrative?.superpowers ?? [])} editing={isEditing("career")} onChange={setDraftSuperpowers} placeholder="e.g. distributed systems" />

            {/* Archetypes */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Role archetypes</label>
              {(isEditing("career") ? draftArchetypes : (p.target_roles?.archetypes ?? [])).map((a, i) => (
                <EntryCard key={i} editing={isEditing("career")} onRemove={() => setDraftArchetypes(d => d.filter((_, j) => j !== i))}>
                  {isEditing("career") ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input value={(a as Archetype).name} onChange={e => setDraftArchetypes(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name (e.g. Backend Engineer)" className={inputCls} />
                      <select value={(a as Archetype).fit} onChange={e => setDraftArchetypes(d => d.map((x, j) => j === i ? { ...x, fit: e.target.value } : x))} className={inputCls}>
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                        <option value="adjacent">Adjacent</option>
                      </select>
                    </div>
                  ) : (
                    <p className="text-sm"><span className="font-medium">{(a as { name: string }).name}</span>{" · "}<span className="text-muted-foreground capitalize">{(a as { fit: string }).fit}</span></p>
                  )}
                </EntryCard>
              ))}
              {isEditing("career") && (
                <AddButton onClick={() => setDraftArchetypes(d => [...d, { name: "", level: "", fit: "primary" }])} label="Add archetype" />
              )}
              {!isEditing("career") && (p.target_roles?.archetypes ?? []).length === 0 && <p className="text-sm text-muted-foreground">—</p>}
            </div>

            {/* Proof points */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Proof points</label>
              {(isEditing("career") ? draftProofPoints : (p.narrative?.proof_points ?? [])).map((pp, i) => (
                <EntryCard key={i} editing={isEditing("career")} onRemove={() => setDraftProofPoints(d => d.filter((_, j) => j !== i))}>
                  {isEditing("career") ? (
                    <div className="grid grid-cols-1 gap-2">
                      <input value={(pp as ProofPoint).name} onChange={e => setDraftProofPoints(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name (e.g. Launched payment system)" className={inputCls} />
                      <input value={(pp as ProofPoint).hero_metric} onChange={e => setDraftProofPoints(d => d.map((x, j) => j === i ? { ...x, hero_metric: e.target.value } : x))} placeholder="Hero metric (e.g. reduced latency by 40%)" className={inputCls} />
                      <input value={(pp as ProofPoint).url} onChange={e => setDraftProofPoints(d => d.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="URL (optional)" type="url" className={inputCls} />
                    </div>
                  ) : (
                    <div className="text-sm space-y-0.5">
                      <p className="font-medium">{(pp as { name: string }).name}</p>
                      <p className="text-muted-foreground">{(pp as { hero_metric: string }).hero_metric}</p>
                      {(pp as { url?: string }).url && <a href={(pp as { url: string }).url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{(pp as { url: string }).url}</a>}
                    </div>
                  )}
                </EntryCard>
              ))}
              {isEditing("career") && <AddButton onClick={() => setDraftProofPoints(d => [...d, { name: "", url: "", hero_metric: "" }])} label="Add proof point" />}
              {!isEditing("career") && (p.narrative?.proof_points ?? []).length === 0 && <p className="text-sm text-muted-foreground">—</p>}
            </div>
          </div>
        </Section>
      )}

      {/* ── Work Preferences ── */}
      {activeSection === "section-work" && (
        <Section id="section-work" title="Work Preferences" icon={<MapPin className="h-4 w-4" />}
          editing={isEditing("work")} saving={isSaving("work")} error={sectionError("work")}
          onEdit={startWork}
          onSave={() => save("work", {
            profile: {
              compensation: { ...(p.compensation ?? {}), target_range: draftCompRange, minimum: draftCompMin, currency: draftCurrency, location_flexibility: draftLocFlex },
              // City/country live in Personal Info's "Location" field — no need
              // to ask for them twice. Onsite availability is now folded into
              // the flexibility text above, so clear the old separate field.
              location: { ...(p.location ?? {}), timezone: draftTimezone, visa_status: draftVisaStatus, onsite_availability: "" },
            },
          })}
          onCancel={() => cancelEdit("work")}>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Compensation</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Target range" value={isEditing("work") ? draftCompRange : (p.compensation?.target_range ?? "")} editing={isEditing("work")} onChange={setDraftCompRange} placeholder="$180k–$220k" />
                <Field label="Minimum" value={isEditing("work") ? draftCompMin : (p.compensation?.minimum ?? "")} editing={isEditing("work")} onChange={setDraftCompMin} placeholder="$160k" />
                <Field label="Currency" value={isEditing("work") ? draftCurrency : (p.compensation?.currency ?? "")} editing={isEditing("work")} onChange={setDraftCurrency} placeholder="USD" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Timezone" value={isEditing("work") ? draftTimezone : (p.location?.timezone ?? "")} editing={isEditing("work")} onChange={setDraftTimezone} placeholder="America/Los_Angeles" />
              <Field label="Visa status" value={isEditing("work") ? draftVisaStatus : (p.location?.visa_status ?? "")} editing={isEditing("work")} onChange={setDraftVisaStatus} placeholder="US Citizen / H-1B…" />
            </div>
            <Field label="Remote / location flexibility" value={isEditing("work") ? draftLocFlex : ([p.compensation?.location_flexibility, p.location?.onsite_availability].filter(Boolean).join(" · "))} editing={isEditing("work")} onChange={setDraftLocFlex} placeholder="Remote-first, open to hybrid; can travel occasionally if needed" />
          </div>
        </Section>
      )}

      {/* ── Job Matching ── */}
      {activeSection === "section-matching" && (
        <Section id="section-matching" title="Job Matching" icon={<Target className="h-4 w-4" />}
          badge={!matchingComplete && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Required for scans
            </span>
          )}
          editing={isEditing("matching")} saving={isSaving("matching")} error={sectionError("matching")}
          onEdit={startMatching}
          onSave={() => save("matching", {
            profile: {
              matching: buildMatchingPrefs({
                titles: draftTitles,
                locations: draftPrefLocations,
                remoteOk: draftRemoteOk,
                eligibleLocations: draftEligibleLocations,
              }),
            },
          })}
          onCancel={() => cancelEdit("matching")}>
          <div className="space-y-6">
            {!matchingComplete && !isEditing("matching") && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs text-foreground">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>Scans are blocked until you&apos;ve added at least one job title and one location — or allowed remote roles.</span>
              </div>
            )}

            {/* ── Roles ── */}
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Roles</p>
              <div className="space-y-3">
                <ChipsField label="Job titles you want" values={isEditing("matching") ? draftTitles : (p.matching?.include_titles ?? [])} editing={isEditing("matching")} onChange={setDraftTitles} placeholder="Start typing a title…" autocomplete="job-titles" />

              </div>
            </div>

            {/* ── Location ── */}
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Location</p>
              <div className="space-y-3">
                <ChipsField label="Preferred locations" values={isEditing("matching") ? draftPrefLocations : (p.matching?.preferred_locations ?? [])} editing={isEditing("matching")} onChange={setDraftPrefLocations} placeholder="Start typing a city…" autocomplete="locations" />
                <ChipsField label="Eligible work locations (optional)" values={isEditing("matching") ? draftEligibleLocations : (p.matching?.eligible_locations ?? [])} editing={isEditing("matching")} onChange={setDraftEligibleLocations} placeholder="Start typing a country…" autocomplete="locations" />

                {/* Remote toggle — styled as a toggle chip */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Remote work</span>
                  {isEditing("matching") ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftRemoteOk(true)}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                          draftRemoteOk
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border text-muted-foreground hover:bg-accent/50",
                        )}
                      >
                        Yes — include remote roles
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftRemoteOk(false)}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                          !draftRemoteOk
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border text-muted-foreground hover:bg-accent/50",
                        )}
                      >
                        No — only my locations
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 text-sm">
                      <span className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        (p.matching?.remote_ok ?? true) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        {(p.matching?.remote_ok ?? true) ? "Remote OK" : "Locations only"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── CV: Experience ── */}
      {activeSection === "section-experience" && (
        <Section id="section-experience" title="Work Experience" icon={<Briefcase className="h-4 w-4" />}
          editing={isEditing("experience")} saving={isSaving("experience")} error={sectionError("experience")}
          onEdit={startExperience}
          onSave={() => save("experience", { cv: { experience: draftExperience } })}
          onCancel={() => cancelEdit("experience")}>
          <div className="space-y-3">
            {(isEditing("experience") ? draftExperience : (c.experience ?? [])).map((exp, i) => (
              <EntryCard key={i} editing={isEditing("experience")} onRemove={() => setDraftExperience(d => d.filter((_, j) => j !== i))}>
                {isEditing("experience") ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input value={exp.company} onChange={e => setDraftExperience(d => d.map((x, j) => j === i ? { ...x, company: e.target.value } : x))} placeholder="Company" className={inputCls} />
                      <input value={exp.role} onChange={e => setDraftExperience(d => d.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role / Title" className={inputCls} />
                      <input value={exp.location} onChange={e => setDraftExperience(d => d.map((x, j) => j === i ? { ...x, location: e.target.value } : x))} placeholder="Location" className={inputCls} />
                      <input value={exp.period} onChange={e => setDraftExperience(d => d.map((x, j) => j === i ? { ...x, period: e.target.value } : x))} placeholder="Period (e.g. Jan 2022 – Present)" className={inputCls} />
                    </div>
                    <ChipsField label="Highlights" values={exp.highlights} editing onChange={v => setDraftExperience(d => d.map((x, j) => j === i ? { ...x, highlights: v } : x))} placeholder="Add a bullet point…" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{exp.company}</p>
                      <p className="text-xs text-muted-foreground">{exp.period}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{exp.role}{exp.location ? ` · ${exp.location}` : ""}</p>
                    {exp.highlights.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-4">
                        {exp.highlights.map((h, hi) => <li key={hi} className="list-disc text-sm">{h}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </EntryCard>
            ))}
            {isEditing("experience") && <AddButton onClick={() => setDraftExperience(d => [...d, { company: "", role: "", location: "", period: "", highlights: [] }])} label="Add experience" />}
            {!isEditing("experience") && (c.experience ?? []).length === 0 && <p className="text-sm text-muted-foreground">No experience added yet.</p>}
          </div>
        </Section>
      )}

      {/* ── CV: Skills ── */}
      {activeSection === "section-skills" && (
        <Section id="section-skills" title="Skills" icon={<Zap className="h-4 w-4" />}
          editing={isEditing("skills")} saving={isSaving("skills")} error={sectionError("skills")}
          onEdit={startSkills}
          onSave={() => save("skills", { cv: { skills: draftSkills } })}
          onCancel={() => cancelEdit("skills")}>
          <div className="space-y-3">
            {(isEditing("skills") ? draftSkills : (c.skills ?? [])).map((sg, i) => (
              <EntryCard key={i} editing={isEditing("skills")} onRemove={() => setDraftSkills(d => d.filter((_, j) => j !== i))}>
                {isEditing("skills") ? (
                  <div className="space-y-2">
                    <input value={sg.category} onChange={e => setDraftSkills(d => d.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} placeholder="Category (e.g. Languages, Frameworks)" className={inputCls} />
                    <ChipsField label="Items" values={sg.items} editing onChange={v => setDraftSkills(d => d.map((x, j) => j === i ? { ...x, items: v } : x))} placeholder="Add a skill…" />
                  </div>
                ) : (
                  <div className="text-sm">
                    <span className="font-medium">{sg.category}:</span>{" "}
                    <span className="text-muted-foreground">{sg.items.join(", ")}</span>
                  </div>
                )}
              </EntryCard>
            ))}
            {isEditing("skills") && <AddButton onClick={() => setDraftSkills(d => [...d, { category: "", items: [] }])} label="Add skill group" />}
            {!isEditing("skills") && (c.skills ?? []).length === 0 && <p className="text-sm text-muted-foreground">No skills added yet.</p>}
          </div>
        </Section>
      )}

    </div>
  );
}

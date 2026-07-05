"use client";

import * as React from "react";
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Check,
  Download,
  FileText,
  GraduationCap,
  Languages,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
  User as UserIcon,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id: string; name: string | null; email: string | null;
  image: string | null; resumeKey: string | null; resumeUpdatedAt: string | null;
}

interface ProfileData {
  candidate?: { full_name?: string; email?: string; phone?: string; location?: string; linkedin?: string; portfolio_url?: string; github?: string; twitter?: string };
  target_roles?: { primary?: string[]; archetypes?: Array<{ name: string; level: string; fit: string }> };
  narrative?: { headline?: string; exit_story?: string; superpowers?: string[]; proof_points?: Array<{ name: string; url?: string; hero_metric: string }> };
  compensation?: { target_range?: string; currency?: string; minimum?: string; location_flexibility?: string };
  location?: { city?: string; country?: string; timezone?: string; visa_status?: string; onsite_availability?: string };
}

interface CvData {
  summary?: string;
  skills?: Array<{ category: string; items: string[] }>;
  experience?: Array<{ company: string; role: string; location: string; period: string; highlights: string[] }>;
  education?: Array<{ institution: string; degree: string; field: string; location: string; period: string }>;
  certifications?: Array<{ name: string; issuer?: string; date?: string }>;
  languages?: Array<{ name: string; proficiency: string }>;
}

// ── Primitives ─────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const inputCls = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function Field({ label, value, editing, onChange, placeholder, multiline = false, type = "text" }: {
  label: string; value: string; editing: boolean;
  onChange: (v: string) => void; placeholder?: string; multiline?: boolean; type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {editing ? (
        multiline
          ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? label} className={cn(inputCls, "resize-y")} />
          : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? label} className={inputCls} />
      ) : (
        <p className="text-sm leading-relaxed">
          {value
            ? value.startsWith("http")
              ? <a href={value} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">{value}</a>
              : value
            : <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </div>
  );
}

function ChipsField({ label, values, editing, onChange, placeholder }: {
  label: string; values: string[]; editing: boolean;
  onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = React.useState("");
  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && !editing && <span className="text-sm text-muted-foreground">—</span>}
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
            {v}
            {editing && (
              <button type="button" onClick={() => onChange(values.filter(x => x !== v))} className="hover:text-destructive" aria-label={`Remove ${v}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {editing && (
        <form onSubmit={add} className="flex gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={placeholder ?? `Add ${label.toLowerCase()}…`}
            className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          <button type="submit" disabled={!draft.trim()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
            <Plus className="h-3 w-3" /> Add
          </button>
        </form>
      )}
    </div>
  );
}

function Section({ title, icon, editing, saving, onEdit, onSave, onCancel, error, children }: {
  title: string; icon: React.ReactNode; editing: boolean; saving: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void; error?: string | null; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        </div>
        {!editing ? (
          <button onClick={onEdit} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
              <X className="h-3 w-3" /> Cancel
            </Button>
          </div>
        )}
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      {children}
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
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resume / CV File</h2>
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      {notice && (
        <p className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
          {extracting && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />}
          {notice}
        </p>
      )}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/30")}
      >
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
        {uploading ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
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
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Auto-fill
            </button>
            <a href="/api/profile/resume" download={`resume.${ext}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Download">
              <Download className="h-4 w-4" />
            </a>
            <button onClick={handleDelete} disabled={deleting || extracting}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Remove">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
type Education = { institution: string; degree: string; field: string; location: string; period: string };
type SkillGroup = { category: string; items: string[] };
type Certification = { name: string; issuer: string; date: string };
type Language = { name: string; proficiency: string };

// ── section edit states ────────────────────────────────────────────────────
type SectionKey = "account" | "personal" | "career" | "work" | "summary" | "experience" | "education" | "skills" | "certLang";

const SECTION_LABEL: Record<SectionKey, string> = {
  account: "Account",
  personal: "Personal info",
  career: "Career profile",
  work: "Work preferences",
  summary: "Professional summary",
  experience: "Work experience",
  education: "Education",
  skills: "Skills",
  certLang: "Certifications & languages",
};

export function ProfileView() {
  const toast = useToast();
  const [user, setUser] = React.useState<UserData | null>(null);
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [cv, setCv] = React.useState<CvData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const [editing, setEditing] = React.useState<Partial<Record<SectionKey, boolean>>>({});
  const [saving, setSaving] = React.useState<Partial<Record<SectionKey, boolean>>>({});
  const [errors, setErrors] = React.useState<Partial<Record<SectionKey, string | null>>>({});

  // ── draft states ───────────────────────────────────────────────────────────
  // account
  const [draftName, setDraftName] = React.useState("");
  // personal
  const [draftFullName, setDraftFullName] = React.useState("");
  const [draftPhone, setDraftPhone] = React.useState("");
  const [draftLocation, setDraftLocation] = React.useState("");
  const [draftLinkedin, setDraftLinkedin] = React.useState("");
  const [draftGithub, setDraftGithub] = React.useState("");
  const [draftPortfolio, setDraftPortfolio] = React.useState("");
  const [draftTwitter, setDraftTwitter] = React.useState("");
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
  const [draftCity, setDraftCity] = React.useState("");
  const [draftCountry, setDraftCountry] = React.useState("");
  const [draftTimezone, setDraftTimezone] = React.useState("");
  const [draftVisaStatus, setDraftVisaStatus] = React.useState("");
  const [draftOnsite, setDraftOnsite] = React.useState("");
  // cv
  const [draftSummary, setDraftSummary] = React.useState("");
  const [draftExperience, setDraftExperience] = React.useState<Experience[]>([]);
  const [draftEducation, setDraftEducation] = React.useState<Education[]>([]);
  const [draftSkills, setDraftSkills] = React.useState<SkillGroup[]>([]);
  const [draftCerts, setDraftCerts] = React.useState<Certification[]>([]);
  const [draftLanguages, setDraftLanguages] = React.useState<Language[]>([]);

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
    setDraftName(user?.name ?? "");
    startEdit("account");
  }
  function startPersonal() {
    const c = profile?.candidate ?? {};
    setDraftFullName(c.full_name ?? ""); setDraftPhone(c.phone ?? "");
    setDraftLocation(c.location ?? ""); setDraftLinkedin(c.linkedin ?? "");
    setDraftGithub(c.github ?? ""); setDraftPortfolio(c.portfolio_url ?? "");
    setDraftTwitter(c.twitter ?? "");
    startEdit("personal");
  }
  function startCareer() {
    const n = profile?.narrative ?? {}; const tr = profile?.target_roles ?? {};
    setDraftHeadline(n.headline ?? ""); setDraftExitStory(n.exit_story ?? "");
    setDraftRoles(tr.primary ?? []); setDraftSuperpowers(n.superpowers ?? []);
    setDraftArchetypes((tr.archetypes ?? []).map(a => ({ name: a.name ?? "", level: a.level ?? "", fit: a.fit ?? "primary" })));
    setDraftProofPoints((n.proof_points ?? []).map(p => ({ name: p.name ?? "", url: p.url ?? "", hero_metric: p.hero_metric ?? "" })));
    startEdit("career");
  }
  function startWork() {
    const c = profile?.compensation ?? {}; const l = profile?.location ?? {};
    setDraftCompRange(c.target_range ?? ""); setDraftCompMin(c.minimum ?? "");
    setDraftCurrency(c.currency ?? ""); setDraftLocFlex(c.location_flexibility ?? "");
    setDraftCity(l.city ?? ""); setDraftCountry(l.country ?? "");
    setDraftTimezone(l.timezone ?? ""); setDraftVisaStatus(l.visa_status ?? "");
    setDraftOnsite(l.onsite_availability ?? "");
    startEdit("work");
  }
  function startSummary() {
    setDraftSummary(cv?.summary ?? "");
    startEdit("summary");
  }
  function startExperience() {
    setDraftExperience((cv?.experience ?? []).map(e => ({ ...e, highlights: [...e.highlights] })));
    startEdit("experience");
  }
  function startEducation() {
    setDraftEducation((cv?.education ?? []).map(e => ({ ...e })));
    startEdit("education");
  }
  function startSkills() {
    setDraftSkills((cv?.skills ?? []).map(s => ({ category: s.category, items: [...s.items] })));
    startEdit("skills");
  }
  function startCertLang() {
    setDraftCerts((cv?.certifications ?? []).map(c => ({ name: c.name, issuer: c.issuer ?? "", date: c.date ?? "" })));
    setDraftLanguages((cv?.languages ?? []).map(l => ({ ...l })));
    startEdit("certLang");
  }

  // ── renders ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

      {/* ── Account ── */}
      <Section title="Account" icon={<UserIcon className="h-4 w-4" />}
        editing={isEditing("account")} saving={isSaving("account")} error={sectionError("account")}
        onEdit={startAccount} onSave={() => save("account", { name: draftName })} onCancel={() => cancelEdit("account")}>
        <div className="flex items-start gap-4">
          {user?.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={user.image} alt="" className="h-16 w-16 shrink-0 rounded-full border border-border" />
            : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-muted"><UserIcon className="h-8 w-8 text-muted-foreground" /></span>}
          <dl className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Display name" value={isEditing("account") ? draftName : (user?.name ?? "")}
              editing={isEditing("account")} onChange={setDraftName} placeholder="Your name" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Email</p>
              <p className="text-sm">{user?.email ?? "—"}</p>
            </div>
          </dl>
        </div>
      </Section>

      {/* ── Resume file ── */}
      <ResumeSection
        resumeKey={user?.resumeKey ?? null} resumeUpdatedAt={user?.resumeUpdatedAt ?? null}
        onUploaded={(key, updatedAt) => setUser(u => u ? { ...u, resumeKey: key || null, resumeUpdatedAt: updatedAt || null } : u)}
        onExtracted={(newProfile, newCv) => { setProfile(newProfile); setCv(newCv); }}
      />

      {/* ── Personal Info ── */}
      <Section title="Personal Info" icon={<UserIcon className="h-4 w-4" />}
        editing={isEditing("personal")} saving={isSaving("personal")} error={sectionError("personal")}
        onEdit={startPersonal}
        onSave={() => save("personal", { profile: { candidate: { ...(p.candidate ?? {}), full_name: draftFullName, phone: draftPhone, location: draftLocation, linkedin: draftLinkedin, github: draftGithub, portfolio_url: draftPortfolio, twitter: draftTwitter } } })}
        onCancel={() => cancelEdit("personal")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" value={isEditing("personal") ? draftFullName : (p.candidate?.full_name ?? "")} editing={isEditing("personal")} onChange={setDraftFullName} placeholder="Jane Smith" />
          <Field label="Phone" value={isEditing("personal") ? draftPhone : (p.candidate?.phone ?? "")} editing={isEditing("personal")} onChange={setDraftPhone} placeholder="+1 (555) 000-0000" type="tel" />
          <Field label="Location" value={isEditing("personal") ? draftLocation : (p.candidate?.location ?? "")} editing={isEditing("personal")} onChange={setDraftLocation} placeholder="San Francisco, CA" />
          <Field label="LinkedIn" value={isEditing("personal") ? draftLinkedin : (p.candidate?.linkedin ?? "")} editing={isEditing("personal")} onChange={setDraftLinkedin} placeholder="https://linkedin.com/in/..." type="url" />
          <Field label="GitHub" value={isEditing("personal") ? draftGithub : (p.candidate?.github ?? "")} editing={isEditing("personal")} onChange={setDraftGithub} placeholder="https://github.com/..." type="url" />
          <Field label="Portfolio / website" value={isEditing("personal") ? draftPortfolio : (p.candidate?.portfolio_url ?? "")} editing={isEditing("personal")} onChange={setDraftPortfolio} placeholder="https://..." type="url" />
          <Field label="Twitter / X" value={isEditing("personal") ? draftTwitter : (p.candidate?.twitter ?? "")} editing={isEditing("personal")} onChange={setDraftTwitter} placeholder="https://twitter.com/..." type="url" />
        </div>
      </Section>

      {/* ── Career Profile ── */}
      <Section title="Career Profile" icon={<Briefcase className="h-4 w-4" />}
        editing={isEditing("career")} saving={isSaving("career")} error={sectionError("career")}
        onEdit={startCareer}
        onSave={() => save("career", {
          profile: {
            narrative: { ...(p.narrative ?? {}), headline: draftHeadline, exit_story: draftExitStory, superpowers: draftSuperpowers, proof_points: draftProofPoints.map(pp => ({ name: pp.name, url: pp.url || undefined, hero_metric: pp.hero_metric })) },
            target_roles: { ...(p.target_roles ?? {}), primary: draftRoles, archetypes: draftArchetypes },
          },
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
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input value={(a as Archetype).name} onChange={e => setDraftArchetypes(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name (e.g. Backend Engineer)" className={inputCls} />
                    <input value={(a as Archetype).level} onChange={e => setDraftArchetypes(d => d.map((x, j) => j === i ? { ...x, level: e.target.value } : x))} placeholder="Level (e.g. Senior)" className={inputCls} />
                    <select value={(a as Archetype).fit} onChange={e => setDraftArchetypes(d => d.map((x, j) => j === i ? { ...x, fit: e.target.value } : x))} className={inputCls}>
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="adjacent">Adjacent</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-sm"><span className="font-medium">{(a as { name: string }).name}</span>{" · "}{(a as { level: string }).level}{" · "}<span className="text-muted-foreground capitalize">{(a as { fit: string }).fit}</span></p>
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

      {/* ── Work Preferences ── */}
      <Section title="Work Preferences" icon={<MapPin className="h-4 w-4" />}
        editing={isEditing("work")} saving={isSaving("work")} error={sectionError("work")}
        onEdit={startWork}
        onSave={() => save("work", {
          profile: {
            compensation: { ...(p.compensation ?? {}), target_range: draftCompRange, minimum: draftCompMin, currency: draftCurrency, location_flexibility: draftLocFlex },
            location: { ...(p.location ?? {}), city: draftCity, country: draftCountry, timezone: draftTimezone, visa_status: draftVisaStatus, onsite_availability: draftOnsite },
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
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Location</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="City" value={isEditing("work") ? draftCity : (p.location?.city ?? "")} editing={isEditing("work")} onChange={setDraftCity} placeholder="San Francisco" />
              <Field label="Country" value={isEditing("work") ? draftCountry : (p.location?.country ?? "")} editing={isEditing("work")} onChange={setDraftCountry} placeholder="United States" />
              <Field label="Timezone" value={isEditing("work") ? draftTimezone : (p.location?.timezone ?? "")} editing={isEditing("work")} onChange={setDraftTimezone} placeholder="America/Los_Angeles" />
              <Field label="Visa status" value={isEditing("work") ? draftVisaStatus : (p.location?.visa_status ?? "")} editing={isEditing("work")} onChange={setDraftVisaStatus} placeholder="US Citizen / H-1B…" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Remote / location flexibility" value={isEditing("work") ? draftLocFlex : (p.compensation?.location_flexibility ?? "")} editing={isEditing("work")} onChange={setDraftLocFlex} placeholder="Remote-first, open to hybrid" />
            <Field label="Onsite availability" value={isEditing("work") ? draftOnsite : (p.location?.onsite_availability ?? "")} editing={isEditing("work")} onChange={setDraftOnsite} placeholder="Up to 2 days/week" />
          </div>
        </div>
      </Section>

      {/* ── CV: Professional Summary ── */}
      <Section title="Professional Summary" icon={<FileText className="h-4 w-4" />}
        editing={isEditing("summary")} saving={isSaving("summary")} error={sectionError("summary")}
        onEdit={startSummary}
        onSave={() => save("summary", { cv: { summary: draftSummary } })}
        onCancel={() => cancelEdit("summary")}>
        <Field label="Summary" value={isEditing("summary") ? draftSummary : (c.summary ?? "")}
          editing={isEditing("summary")} onChange={setDraftSummary}
          placeholder="A concise overview of your professional background, key skills, and career goals…" multiline />
      </Section>

      {/* ── CV: Experience ── */}
      <Section title="Work Experience" icon={<Briefcase className="h-4 w-4" />}
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

      {/* ── CV: Education ── */}
      <Section title="Education" icon={<GraduationCap className="h-4 w-4" />}
        editing={isEditing("education")} saving={isSaving("education")} error={sectionError("education")}
        onEdit={startEducation}
        onSave={() => save("education", { cv: { education: draftEducation } })}
        onCancel={() => cancelEdit("education")}>
        <div className="space-y-3">
          {(isEditing("education") ? draftEducation : (c.education ?? [])).map((edu, i) => (
            <EntryCard key={i} editing={isEditing("education")} onRemove={() => setDraftEducation(d => d.filter((_, j) => j !== i))}>
              {isEditing("education") ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={edu.institution} onChange={e => setDraftEducation(d => d.map((x, j) => j === i ? { ...x, institution: e.target.value } : x))} placeholder="Institution" className={inputCls} />
                  <input value={edu.period} onChange={e => setDraftEducation(d => d.map((x, j) => j === i ? { ...x, period: e.target.value } : x))} placeholder="Period (e.g. 2018 – 2022)" className={inputCls} />
                  <input value={edu.degree} onChange={e => setDraftEducation(d => d.map((x, j) => j === i ? { ...x, degree: e.target.value } : x))} placeholder="Degree (e.g. B.S.)" className={inputCls} />
                  <input value={edu.field} onChange={e => setDraftEducation(d => d.map((x, j) => j === i ? { ...x, field: e.target.value } : x))} placeholder="Field (e.g. Computer Science)" className={inputCls} />
                  <input value={edu.location} onChange={e => setDraftEducation(d => d.map((x, j) => j === i ? { ...x, location: e.target.value } : x))} placeholder="Location" className={inputCls} />
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{edu.institution}</p>
                    <p className="text-xs text-muted-foreground">{edu.period}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{[edu.degree, edu.field].filter(Boolean).join(" · ")}{edu.location ? ` · ${edu.location}` : ""}</p>
                </div>
              )}
            </EntryCard>
          ))}
          {isEditing("education") && <AddButton onClick={() => setDraftEducation(d => [...d, { institution: "", degree: "", field: "", location: "", period: "" }])} label="Add education" />}
          {!isEditing("education") && (c.education ?? []).length === 0 && <p className="text-sm text-muted-foreground">No education added yet.</p>}
        </div>
      </Section>

      {/* ── CV: Skills ── */}
      <Section title="Skills" icon={<Zap className="h-4 w-4" />}
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

      {/* ── CV: Certifications & Languages ── */}
      <Section title="Certifications & Languages" icon={<Star className="h-4 w-4" />}
        editing={isEditing("certLang")} saving={isSaving("certLang")} error={sectionError("certLang")}
        onEdit={startCertLang}
        onSave={() => save("certLang", { cv: { certifications: draftCerts.map(c => ({ name: c.name, issuer: c.issuer || undefined, date: c.date || undefined })), languages: draftLanguages } })}
        onCancel={() => cancelEdit("certLang")}>
        <div className="space-y-5">
          {/* Certifications */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Certifications</p>
            {(isEditing("certLang") ? draftCerts : (c.certifications ?? [])).map((cert, i) => (
              <EntryCard key={i} editing={isEditing("certLang")} onRemove={() => setDraftCerts(d => d.filter((_, j) => j !== i))}>
                {isEditing("certLang") ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input value={(cert as Certification).name} onChange={e => setDraftCerts(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Certification name" className={inputCls} />
                    <input value={(cert as Certification).issuer} onChange={e => setDraftCerts(d => d.map((x, j) => j === i ? { ...x, issuer: e.target.value } : x))} placeholder="Issuer (optional)" className={inputCls} />
                    <input value={(cert as Certification).date} onChange={e => setDraftCerts(d => d.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} placeholder="Date (optional)" className={inputCls} />
                  </div>
                ) : (
                  <p className="text-sm">
                    <span className="font-medium">{(cert as { name: string }).name}</span>
                    {(cert as { issuer?: string }).issuer && <span className="text-muted-foreground"> · {(cert as { issuer: string }).issuer}</span>}
                    {(cert as { date?: string }).date && <span className="text-muted-foreground"> · {(cert as { date: string }).date}</span>}
                  </p>
                )}
              </EntryCard>
            ))}
            {isEditing("certLang") && <AddButton onClick={() => setDraftCerts(d => [...d, { name: "", issuer: "", date: "" }])} label="Add certification" />}
            {!isEditing("certLang") && (c.certifications ?? []).length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          </div>

          {/* Languages */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Languages</p>
            {(isEditing("certLang") ? draftLanguages : (c.languages ?? [])).map((lang, i) => (
              <EntryCard key={i} editing={isEditing("certLang")} onRemove={() => setDraftLanguages(d => d.filter((_, j) => j !== i))}>
                {isEditing("certLang") ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={lang.name} onChange={e => setDraftLanguages(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Language" className={inputCls} />
                    <input value={lang.proficiency} onChange={e => setDraftLanguages(d => d.map((x, j) => j === i ? { ...x, proficiency: e.target.value } : x))} placeholder="Proficiency (e.g. Native, Fluent)" className={inputCls} />
                  </div>
                ) : (
                  <p className="text-sm"><span className="font-medium">{lang.name}</span><span className="text-muted-foreground"> · {lang.proficiency}</span></p>
                )}
              </EntryCard>
            ))}
            {isEditing("certLang") && <AddButton onClick={() => setDraftLanguages(d => [...d, { name: "", proficiency: "" }])} label="Add language" />}
            {!isEditing("certLang") && (c.languages ?? []).length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          </div>
        </div>
      </Section>

      {/* ── CV: Books / Reading ── placeholder for future ── */}
    </div>
  );
}

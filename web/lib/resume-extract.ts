/**
 * Resume parsing + LLM structuring.
 *
 * 1. extractResumeText()  — pull plain text out of a PDF / DOCX buffer.
 * 2. structureResume()    — ask an LLM to map that text onto the Profile + CV
 *                           JSON shapes used by the app.
 * 3. fillEmpty()          — deep-merge that only fills missing / empty fields,
 *                           so extraction never clobbers data the user typed.
 *
 * The route handler that uses this runs with `runtime = "nodejs"`.
 */

import path from "node:path";

import { callLLM, resolveProvider } from "../../src/lib/llm";
import { loadEnv } from "../../src/lib/env";
import type { MatchingPrefs } from "../../src/lib/profile-store";
import { deriveMatchingDefaults } from "./matching-defaults";

export { deriveMatchingDefaults };

// ── Env ─────────────────────────────────────────────────────────────────────

/**
 * The Next.js process does not load the repo-root `.env` (it only reads
 * `web/.env*`).  Pull in the root file so NVIDIA_API_KEY / OPENCODE_API_KEY /
 * CAREER_OPS_PROVIDER are available.  `loadEnv` never overwrites existing vars
 * and is a no-op when the file is missing, so trying a couple of locations is
 * safe regardless of the working directory.
 */
function ensureEnv() {
  loadEnv(path.join(process.cwd(), ".env"));
  loadEnv(path.join(process.cwd(), "..", ".env"));
}

// ── Text extraction ──────────────────────────────────────────────────────────

export async function extractResumeText(buffer: Buffer, ext: string): Promise<string> {
  const lower = ext.toLowerCase();

  if (lower === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  }

  if (lower === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }

  // Legacy .doc (binary) is not supported by mammoth.
  throw new Error(
    `Cannot extract text from a .${ext} file. Please upload a PDF or DOCX résumé.`,
  );
}

// ── LLM structuring ──────────────────────────────────────────────────────────

export interface ExtractedProfile {
  candidate: {
    full_name: string; email: string; phone: string; location: string;
    linkedin: string; portfolio_url: string; github: string; twitter: string;
  };
  target_roles: {
    primary: string[];
    archetypes: Array<{ name: string; level: string; fit: string }>;
  };
  narrative: {
    headline: string; exit_story: string; superpowers: string[];
    proof_points: Array<{ name: string; url: string; hero_metric: string }>;
  };
  compensation: { target_range: string; currency: string; minimum: string; location_flexibility: string };
  location: { country: string; city: string; timezone: string; visa_status: string; onsite_availability: string };
  /**
   * Not produced by the LLM (omitted from SCHEMA_HINT) — filled in
   * deterministically by `deriveMatchingDefaults()` at the end of
   * `structureResume()`. See that function for why.
   */
  matching?: MatchingPrefs;
}

export interface ExtractedCV {
  summary: string;
  skills: Array<{ category: string; items: string[] }>;
  experience: Array<{ company: string; role: string; location: string; period: string; highlights: string[] }>;
  education: Array<{ institution: string; degree: string; field: string; period: string; details: string }>;
  certifications: Array<{ name: string; issuer: string; year: string }>;
  projects: Array<{ name: string; description: string; url: string; highlights: string[] }>;
  languages: Array<{ language: string; proficiency: string }>;
}

export interface ExtractionResult {
  profile: ExtractedProfile;
  cv: ExtractedCV;
}

// `Profile.matching` (src/lib/profile-store.ts) drives the scan matchers and
// is required before a scan can run — `validateMatchingReadiness` blocks it
// until there is at least one role indicator AND one location indicator.
// Rather than asking the LLM to invent keyword lists — unreliable and hard to
// validate — defaults are derived deterministically in `./matching-defaults`
// (shared with the manual "Job Matching" form) from fields the LLM already
// extracts reliably (target_roles, candidate/location). See that module for
// details; `deriveMatchingDefaults` is re-exported above for callers of this
// module (and existing tests).

const SCHEMA_HINT = `{
  "profile": {
    "candidate": { "full_name": "", "email": "", "phone": "", "location": "", "linkedin": "", "portfolio_url": "", "github": "", "twitter": "" },
    "target_roles": { "primary": [], "archetypes": [{ "name": "", "level": "", "fit": "primary|secondary|adjacent" }] },
    "narrative": { "headline": "", "exit_story": "", "superpowers": [], "proof_points": [{ "name": "", "url": "", "hero_metric": "" }] },
    "compensation": { "target_range": "", "currency": "", "minimum": "", "location_flexibility": "" },
    "location": { "country": "", "city": "", "timezone": "", "visa_status": "", "onsite_availability": "" }
  },
  "cv": {
    "summary": "",
    "skills": [{ "category": "", "items": [] }],
    "experience": [{ "company": "", "role": "", "location": "", "period": "", "highlights": [] }],
    "education": [{ "institution": "", "degree": "", "field": "", "period": "", "details": "" }],
    "certifications": [{ "name": "", "issuer": "", "year": "" }],
    "projects": [{ "name": "", "description": "", "url": "", "highlights": [] }],
    "languages": [{ "language": "", "proficiency": "" }]
  }
}`;

/** Strip ```json fences and parse, tolerating extra prose around the JSON. */
function parseJsonLoose(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

export async function structureResume(resumeText: string): Promise<ExtractionResult> {
  ensureEnv();

  const providerArg = process.env.CAREER_OPS_PROVIDER || "nvidia";
  const provider = resolveProvider(providerArg);
  const model = process.env.CAREER_OPS_MODEL || provider.defaultModel;
  const apiKey = process.env[provider.authEnvVar] || process.env.OPENCODE_API_KEY || "";

  if (!apiKey) {
    throw new Error(
      `No LLM API key found. Set ${provider.authEnvVar} (or OPENCODE_API_KEY) in your .env.`,
    );
  }

  const text = resumeText.slice(0, 20000); // keep the prompt within context limits

  const prompt = [
    "You are a precise résumé parser. Extract structured data from the résumé below",
    "and return it as STRICT JSON matching exactly this shape (same keys, same nesting):",
    "",
    SCHEMA_HINT,
    "",
    "Rules:",
    "- Output ONLY the JSON object. No markdown, no commentary.",
    "- Return EVERY key shown in the shape, even when its value is empty.",
    "- Use only information explicitly present in the résumé; never fabricate.",
    '- For any field you cannot determine, use an empty string "" or an empty array [].',
    "- Do NOT invent compensation, visa status, or timezone if they are not stated.",
    "- Keep dates/periods exactly as written in the résumé (e.g. \"Jan 2021 – Present\").",
    "- Do not duplicate the same entry across sections; each role/school/skill appears once.",
    "",
    "Contact & links:",
    '- "email"/"phone": copy verbatim. "linkedin"/"github"/"portfolio_url": full URLs if present.',
    "",
    "Narrative:",
    '- "exit_story" / cv "summary": the résumé\'s professional-summary/objective text (may be identical).',
    '- "headline": a one-line title (job title + specialty).',
    '- "superpowers": 3-6 short strength phrases inferred from the résumé.',
    '- "proof_points": standout achievements with a concrete metric where available.',
    "",
    "Roles:",
    '- "target_roles.primary": 2-4 concise job titles that best match the candidate\'s',
    "  demonstrated experience — from their most recent role(s), a stated objective, or a",
    "  theme repeated across roles. Always fill this when the résumé shows any work history.",
    '- "target_roles.archetypes": 1-3 entries built from target_roles.primary / experience,',
    '  each with a "level" inferred from years of experience (e.g. "Entry-Level", "Mid",',
    '  "Senior", "Staff+") and "fit" set to "primary" for the closest match.',
    '- archetype "fit" MUST be exactly one of: primary, secondary, adjacent.',
    "",
    "CV sections:",
    '- "skills": group related skills under sensible categories (e.g. "Languages", "Cloud").',
    '- "experience.highlights": the bullet points under each role, verbatim where possible.',
    '- "education": every degree/diploma with institution, degree, field of study, and period.',
    '- "certifications": professional certifications/licenses with issuer and year when stated.',
    '- "projects": notable personal, side, or open-source projects with a short description.',
    '- "languages": spoken/written languages with a proficiency label',
    '  (e.g. "Native", "Fluent", "Professional", "Conversational") when stated.',
    "",
    "RÉSUMÉ:",
    text,
  ].join("\n");

  const response = await callLLM({
    prompt,
    apiKey,
    baseURL: provider.baseURL,
    model,
    temperature: 0.1,
    maxTokens: 6000,
  });

  let parsed: unknown;
  try {
    parsed = parseJsonLoose(response);
  } catch {
    throw new Error("The model did not return valid JSON. Try again.");
  }

  // Coerce the model's output into the exact schema — see normalizeExtraction.
  return normalizeExtraction(parsed);
}

// ── Normalization ─────────────────────────────────────────────────────────────
//
// LLMs are only *mostly* consistent: a field the schema declares as an array
// occasionally comes back as a string (or vice-versa), casing drifts, the same
// skill is listed twice, an enum lands on a synonym, and whitespace is noisy.
// Casting the raw JSON with `as ExtractedCV` hides all of that and lets it flow
// into storage and the scan matchers. This layer instead rebuilds the object
// field-by-field so the output ALWAYS matches the declared shape and types,
// deterministically — the single biggest lever on extraction consistency.

const FIT_VALUES = new Set(["primary", "secondary", "adjacent"]);

/** Trim + collapse internal whitespace on a single-line string. */
function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** Trim while preserving paragraph breaks — for summaries / descriptions. */
function cleanMultiline(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Case-insensitive dedupe that preserves the first-seen casing/order. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const key = it.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

/**
 * Coerce anything into a clean string[]: accepts an array (of strings or
 * objects with a name/label), a single string, or a comma/•/newline-separated
 * string. Trims, drops blanks, dedupes, and caps length.
 */
function cleanStrArray(v: unknown, cap = 30): string[] {
  let raw: unknown[];
  if (Array.isArray(v)) raw = v;
  else if (typeof v === "string" && v.trim())
    raw = v.split(/[,\u2022\n;]+/); // comma / bullet / newline / semicolon
  else raw = [];

  const cleaned = raw
    .map((item) => {
      if (typeof item === "string") return cleanStr(item);
      const o = rec(item);
      return cleanStr(o.name ?? o.label ?? o.value ?? "");
    })
    .filter(Boolean);
  return dedupe(cleaned).slice(0, cap);
}

function cleanEmail(v: unknown): string {
  const s = cleanStr(v).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : "";
}

/** Normalize a link: add https:// to bare domains, leave handles untouched. */
function cleanUrl(v: unknown): string {
  const s = cleanStr(v).replace(/^@/, "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return `https://${s}`;
  return s;
}

function cleanFit(v: unknown): "primary" | "secondary" | "adjacent" {
  const s = cleanStr(v).toLowerCase();
  return (FIT_VALUES.has(s) ? s : "primary") as "primary" | "secondary" | "adjacent";
}

export function normalizeProfile(raw: unknown): ExtractedProfile {
  const p = rec(raw);
  const c = rec(p.candidate);
  const tr = rec(p.target_roles);
  const nar = rec(p.narrative);
  const comp = rec(p.compensation);
  const loc = rec(p.location);

  return {
    candidate: {
      full_name: cleanStr(c.full_name),
      email: cleanEmail(c.email),
      phone: cleanStr(c.phone),
      location: cleanStr(c.location),
      linkedin: cleanUrl(c.linkedin),
      portfolio_url: cleanUrl(c.portfolio_url),
      github: cleanUrl(c.github),
      twitter: cleanUrl(c.twitter),
    },
    target_roles: {
      primary: cleanStrArray(tr.primary, 6),
      archetypes: asArray(tr.archetypes)
        .map((a) => {
          const o = rec(a);
          return { name: cleanStr(o.name), level: cleanStr(o.level), fit: cleanFit(o.fit) };
        })
        .filter((a) => a.name)
        .slice(0, 5),
    },
    narrative: {
      headline: cleanStr(nar.headline),
      exit_story: cleanMultiline(nar.exit_story),
      superpowers: cleanStrArray(nar.superpowers, 8),
      proof_points: asArray(nar.proof_points)
        .map((pp) => {
          const o = rec(pp);
          return {
            name: cleanStr(o.name),
            url: cleanUrl(o.url),
            hero_metric: cleanStr(o.hero_metric ?? o.metric),
          };
        })
        .filter((pp) => pp.name || pp.hero_metric)
        .slice(0, 6),
    },
    compensation: {
      target_range: cleanStr(comp.target_range),
      currency: cleanStr(comp.currency),
      minimum: cleanStr(comp.minimum),
      location_flexibility: cleanStr(comp.location_flexibility),
    },
    location: {
      country: cleanStr(loc.country),
      city: cleanStr(loc.city),
      timezone: cleanStr(loc.timezone),
      visa_status: cleanStr(loc.visa_status),
      onsite_availability: cleanStr(loc.onsite_availability),
    },
  };
}

export function normalizeCv(raw: unknown): ExtractedCV {
  const cv = rec(raw);

  // Skills may arrive grouped ([{category, items}]) or as a flat string list;
  // fold a flat list into a single sensible group so nothing is dropped.
  const rawSkills = asArray(cv.skills);
  const allStrings = rawSkills.length > 0 && rawSkills.every((s) => typeof s === "string");
  const skills = allStrings
    ? [{ category: "Skills", items: cleanStrArray(rawSkills, 60) }]
    : rawSkills
        .map((s) => {
          const o = rec(s);
          return { category: cleanStr(o.category ?? o.name), items: cleanStrArray(o.items, 40) };
        })
        .filter((s) => s.category || s.items.length)
        .slice(0, 20);

  return {
    summary: cleanMultiline(cv.summary),
    skills,
    experience: asArray(cv.experience)
      .map((e) => {
        const o = rec(e);
        return {
          company: cleanStr(o.company),
          role: cleanStr(o.role ?? o.title),
          location: cleanStr(o.location),
          period: cleanStr(o.period ?? o.dates),
          highlights: cleanStrArray(o.highlights ?? o.bullets, 20),
        };
      })
      .filter((e) => e.company || e.role)
      .slice(0, 25),
    education: asArray(cv.education)
      .map((e) => {
        const o = rec(e);
        return {
          institution: cleanStr(o.institution ?? o.school),
          degree: cleanStr(o.degree),
          field: cleanStr(o.field ?? o.field_of_study),
          period: cleanStr(o.period ?? o.dates ?? o.year),
          details: cleanMultiline(o.details),
        };
      })
      .filter((e) => e.institution || e.degree)
      .slice(0, 12),
    certifications: asArray(cv.certifications)
      .map((x) => {
        const o = rec(x);
        return {
          name: cleanStr(o.name ?? o.title),
          issuer: cleanStr(o.issuer ?? o.authority),
          year: cleanStr(o.year ?? o.date),
        };
      })
      .filter((x) => x.name)
      .slice(0, 20),
    projects: asArray(cv.projects)
      .map((x) => {
        const o = rec(x);
        return {
          name: cleanStr(o.name ?? o.title),
          description: cleanMultiline(o.description),
          url: cleanUrl(o.url ?? o.link),
          highlights: cleanStrArray(o.highlights ?? o.bullets, 12),
        };
      })
      .filter((x) => x.name)
      .slice(0, 15),
    languages: asArray(cv.languages)
      .map((x) => {
        if (typeof x === "string") return { language: cleanStr(x), proficiency: "" };
        const o = rec(x);
        return {
          language: cleanStr(o.language ?? o.name),
          proficiency: cleanStr(o.proficiency ?? o.level),
        };
      })
      .filter((x) => x.language)
      .slice(0, 15),
  };
}

/**
 * Turn the loosely-parsed LLM JSON into a fully-formed, type-correct
 * `ExtractionResult`. The deterministic job-matching defaults always win over
 * anything the model may have guessed for `matching` (it isn't asked for one —
 * see SCHEMA_HINT — but this keeps the contract airtight either way).
 */
export function normalizeExtraction(raw: unknown): ExtractionResult {
  const obj = rec(raw);
  const profile = normalizeProfile(obj.profile);
  return {
    profile: { ...profile, matching: deriveMatchingDefaults(profile) },
    cv: normalizeCv(obj.cv),
  };
}

// ── Fill-empty merge ─────────────────────────────────────────────────────────

function isEmptyVal(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(isEmptyVal);
  return false;
}

/**
 * Deep-merge `source` into `target`, only filling values that are missing or
 * empty in `target`. Existing non-empty user data always wins.
 */
export function fillEmpty<T>(target: T, source: T): T {
  if (source == null) return target;
  if (target == null) return source;

  if (Array.isArray(target) || Array.isArray(source)) {
    const t = target as unknown as unknown[];
    return (Array.isArray(t) && t.length > 0 ? target : (source ?? target)) as T;
  }

  if (typeof target === "object" && typeof source === "object") {
    const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
    for (const k of Object.keys(source as Record<string, unknown>)) {
      const sv = (source as Record<string, unknown>)[k];
      out[k] = k in out ? fillEmpty(out[k], sv) : sv;
    }
    return out as T;
  }

  return (isEmptyVal(target) ? source : target) as T;
}

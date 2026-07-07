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
    "experience": [{ "company": "", "role": "", "location": "", "period": "", "highlights": [] }]
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
    "- Use information that is explicitly present in the résumé.",
    '- For any field you cannot determine, use an empty string "" or an empty array [].',
    "- Do NOT invent compensation, visa status, or timezone if they are not stated.",
    '- "exit_story" / cv "summary": use the résumé\'s professional-summary/objective text.',
    '- "headline": a one-line title (e.g. job title + specialty).',
    '- "superpowers": 3-6 short strength phrases inferred from the résumé.',
    '- "skills": group related skills under sensible categories.',
    '- "highlights": the bullet points under each role, verbatim where possible.',
    '- "target_roles.primary": 2-4 concise job titles that best match the candidate\'s',
    "  demonstrated experience — from their most recent role(s), a stated objective, or a",
    "  theme repeated across roles. Always fill this when the résumé shows any work history.",
    '- "target_roles.archetypes": 1-3 entries built from target_roles.primary / experience,',
    '  each with a "level" inferred from years of experience (e.g. "Entry-Level", "Mid",',
    '  "Senior", "Staff+") and "fit" set to "primary" for the closest match.',
    '- archetype "fit" must be one of: primary, secondary, adjacent.',
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

  const obj = (parsed ?? {}) as Partial<ExtractionResult>;
  const profile = (obj.profile ?? {}) as ExtractedProfile;
  return {
    // Deterministic job-matching defaults always win over anything the model
    // may have guessed for `matching` (it isn't asked for one — see
    // SCHEMA_HINT — but this keeps the contract airtight either way).
    profile: { ...profile, matching: deriveMatchingDefaults(profile) },
    cv: (obj.cv ?? {}) as ExtractedCV,
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

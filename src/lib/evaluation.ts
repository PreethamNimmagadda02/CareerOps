/**
 * Evaluation-report parsing — extracts the structured insights the LLM
 * already generates (recommendation, per-dimension scores, archetype, comp,
 * gaps…) so they can be persisted as real columns instead of living only in
 * report markdown.
 *
 * All parsers are tolerant of common LLM formatting drift: bold markers,
 * table-cell vs bullet layouts, en/em dashes, and case variations.
 */

import { parseScore } from "./prompt.js";

export type Recommendation = "APPLY_NOW" | "APPLY_WITH_TWEAKS" | "MONITOR" | "SKIP";

export interface ScoreDimension {
  key: string;
  label: string;
  /** Contribution to the overall score (0–1). */
  weight: number;
  /** 1–5 rating. */
  score: number;
  reason?: string;
}

export interface EvaluationInsights {
  /** Overall score, one-decimal string (e.g. "4.2") — mirrors `parseScore`. */
  score: string | null;
  scoreNumeric: number | null;
  recommendation: Recommendation | null;
  recommendationNote: string | null;
  archetype: string | null;
  tldr: string | null;
  remote: string | null;
  comp: string | null;
  dimensions: ScoreDimension[];
  gaps: string[];
}

/** The five scored dimensions from the SCORE BREAKDOWN prompt section. */
const DIMENSIONS: ReadonlyArray<{ key: string; label: string; pattern: string; weight: number }> = [
  { key: "technical", label: "Technical Fit", pattern: "Technical\\s+Fit", weight: 0.35 },
  { key: "level", label: "Level Match", pattern: "Level\\s+Match", weight: 0.2 },
  { key: "location", label: "Location/Remote", pattern: "Location\\s*/?\\s*Remote|Location", weight: 0.15 },
  { key: "growth", label: "Growth Potential", pattern: "Growth\\s+Potential", weight: 0.15 },
  { key: "domain", label: "Domain Fit", pattern: "Domain\\s+Fit", weight: 0.15 },
];

/** The seven canonical role archetypes from the prompt. */
const ARCHETYPES = [
  "AI Platform/LLMOps",
  "Agentic/Automation",
  "AI Solutions Architect",
  "AI Forward Deployed",
  "AI Transformation",
  "Software Engineering",
  "Other",
] as const;

/** Strip bold/italic markers and surrounding pipes/whitespace from a fragment. */
function clean(s: string): string {
  return s
    .replace(/\*\*|__|\*/g, "")
    .replace(/^[|\s:–—-]+|[|\s]+$/g, "")
    .trim();
}

/**
 * Return the text of a markdown section: from the heading matching `title`
 * (e.g. "RECOMMENDATION", "D\\) COMPENSATION") to the next **level-2**
 * heading. Level-3 headings (e.g. "### Gaps – …") are subsections and stay
 * inside their parent's scope.
 */
function section(text: string, title: string): string | null {
  const re = new RegExp(`^#{2,3}\\s*(?:\\*\\*)?\\s*${title}[^\\n]*$`, "im");
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^##\s/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** True for a markdown table separator row: |---|:---:|…| */
function isTableSeparator(line: string): boolean {
  return /^\|(?:\s*:?-{2,}:?\s*\|)+\s*$/.test(line);
}

/** Extract `| **Field** | value |` from a markdown table. */
function tableField(text: string, field: string): string | null {
  const re = new RegExp(`\\|\\s*\\*?\\*?${field}\\*?\\*?\\s*\\|\\s*(.+?)\\s*\\|`, "i");
  const m = text.match(re);
  return m ? clean(m[1] as string) || null : null;
}

/** Parse the per-dimension 1–5 ratings from the SCORE BREAKDOWN section. */
export function parseDimensions(text: string): ScoreDimension[] {
  const scope = section(text, "SCORE\\s+BREAKDOWN") ?? text;
  const out: ScoreDimension[] = [];

  for (const dim of DIMENSIONS) {
    // Table rows first — the rating cell may be a bare number without "/5"
    // ("| **Technical Fit** | 3.5 | reason |"), which is only safe to accept
    // when it sits alone inside a cell.
    const tableRe = new RegExp(
      `\\|\\s*\\*{0,2}(?:${dim.pattern})\\*{0,2}\\s*\\|\\s*\\*{0,2}(\\d(?:\\.\\d+)?)(?:\\s*/\\s*5)?\\s*\\*{0,2}\\s*\\|\\s*([^|\\n]*)`,
      "im",
    );
    // Bullets / prose require the explicit "/5" to avoid false positives
    // ("- Technical Fit: 4/5 — reason", "**Technical Fit** 4 / 5 …").
    const inlineRe = new RegExp(
      `(?:${dim.pattern})\\s*\\*{0,2}[:|\\s]*\\*{0,2}\\s*(\\d(?:\\.\\d+)?)\\s*/\\s*5` +
        `(?:\\s*\\*{0,2}\\s*[—–:|-]\\s*(.+?)(?:\\||$))?`,
      "im",
    );

    const m = scope.match(tableRe) ?? scope.match(inlineRe);
    if (!m) continue;
    const score = parseFloat(m[1] as string);
    if (Number.isNaN(score) || score < 0 || score > 5) continue;
    const reason = m[2] ? clean(m[2]) : undefined;
    out.push({ key: dim.key, label: dim.label, weight: dim.weight, score, ...(reason ? { reason } : {}) });
  }

  return out;
}

/** Parse the final APPLY NOW / APPLY WITH TWEAKS / MONITOR / SKIP verdict. */
export function parseRecommendation(text: string): {
  recommendation: Recommendation | null;
  note: string | null;
} {
  const scope = section(text, "RECOMMENDATION") ?? text.slice(-2000);

  // Drop any echo of the choice list itself ("APPLY NOW | APPLY WITH TWEAKS | …").
  const lines = scope
    .split("\n")
    .filter((l) => !/APPLY\s+NOW\s*\|\s*APPLY\s+WITH\s+TWEAKS\s*\|/i.test(l) || countVerdicts(l) < 3);

  for (const line of lines) {
    // Longest token first so "APPLY WITH TWEAKS" isn't shadowed.
    const m = line.match(/\b(APPLY\s+WITH\s+TWEAKS|APPLY\s+NOW|MONITOR|SKIP)\b/);
    if (!m) continue;
    const token = (m[1] as string).replace(/\s+/g, "_").toUpperCase() as Recommendation;
    const after = clean(line.slice((m.index ?? 0) + (m[1] as string).length));
    return { recommendation: token, note: after || null };
  }
  return { recommendation: null, note: null };
}

/** How many distinct verdict tokens appear in a line (choice-list detector). */
function countVerdicts(line: string): number {
  let n = 0;
  for (const t of [/APPLY\s+NOW/i, /APPLY\s+WITH\s+TWEAKS/i, /\bMONITOR\b/i, /\bSKIP\b/i]) {
    if (t.test(line)) n++;
  }
  return n;
}

/** Parse the role archetype (canonical value) from the ARCHETYPE section or table. */
export function parseArchetype(text: string): string | null {
  const scope = section(text, "ARCHETYPE") ?? "";
  for (const a of ARCHETYPES) {
    if (a === "Other") continue; // too generic to match inside prose first
    if (scope.toLowerCase().includes(a.toLowerCase())) return a;
  }
  const fromTable = tableField(text, "Archetype");
  if (fromTable) {
    for (const a of ARCHETYPES) {
      if (fromTable.toLowerCase().includes(a.toLowerCase())) return a;
    }
    return fromTable.slice(0, 60);
  }
  if (/\bOther\b/.test(scope)) return "Other";
  return null;
}

/** Parse the one-line comp estimate from section D (first line with money in it). */
export function parseComp(text: string): string | null {
  const scope = section(text, "D\\)\\s*COMPENSATION") ?? section(text, "COMPENSATION");
  if (!scope) return tableField(text, "Comp(?:ensation)?");

  const money = /(₹|\$|€|£|INR|USD|EUR|GBP|LPA|lakh)/i;
  for (const raw of scope.split("\n")) {
    const line = clean(raw.replace(/^[-*•\d.\s]+/, ""));
    if (!line) continue;
    if (money.test(line) && /\d/.test(line)) return line.slice(0, 160);
  }
  return null;
}

/**
 * Parse hard-blocker gaps from section B's Gaps subsection (max 4).
 * Handles both bullet lists and the common table form:
 *   ### Gaps – Hard blockers & Mitigation
 *   | Gap | Why it matters | Mitigation |
 *   |---|---|---|
 *   | **Missing X** | … | … |
 */
export function parseGaps(text: string): string[] {
  const scopeB = section(text, "B\\)\\s*CV\\s*MATCH") ?? text;
  const m = scopeB.match(/^#{0,4}\s*\*{0,2}Gaps\b[^\n]*\n?([\s\S]*)/im);
  if (!m) return [];

  const gaps: string[] = [];
  let inTable = false;

  for (const raw of (m[1] as string).split("\n")) {
    if (/^#{2,4}\s/.test(raw)) break; // next (sub)section
    const line = raw.trim();

    if (!line) {
      if (gaps.length > 0) break; // end of the gaps block
      continue;
    }

    if (line.startsWith("|")) {
      if (isTableSeparator(line)) {
        inTable = true; // header row is above; data rows follow
        continue;
      }
      if (!inTable) continue; // header row
      const firstCell = clean(line.split("|").find((c) => c.trim()) ?? "");
      if (firstCell) gaps.push(firstCell.slice(0, 200));
    } else {
      const bullet = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
      if (!bullet) continue;
      const item = clean(bullet[1] as string);
      if (item) gaps.push(item.slice(0, 200));
    }

    if (gaps.length >= 4) break;
  }
  return gaps;
}

/** Parse everything the dashboard needs from a raw evaluation markdown. */
export function parseEvaluation(text: string): EvaluationInsights {
  const score = parseScore(text);
  const { recommendation, note } = parseRecommendation(text);

  return {
    score,
    scoreNumeric: score !== null ? parseFloat(score) : null,
    recommendation,
    recommendationNote: note,
    archetype: parseArchetype(text),
    tldr: tableField(text, "TL;?DR"),
    remote: tableField(text, "Remote"),
    comp: parseComp(text),
    dimensions: parseDimensions(text),
    gaps: parseGaps(text),
  };
}

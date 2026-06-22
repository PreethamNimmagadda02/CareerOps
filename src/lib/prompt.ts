/** Build the structured A–F evaluation prompt for a single job. */
export function buildPrompt(opts: {
  cv: string;
  profileYml: string;
  jdText: string;
  company: string;
  role: string;
}): string {
  const { cv, profileYml, jdText, company, role } = opts;
  return `You are an expert career advisor evaluating a job opportunity for a candidate.

## CANDIDATE CV
${cv}

## CANDIDATE PROFILE
${profileYml}

## JOB: ${company} — ${role}
${jdText}

---

Produce a structured evaluation with EXACTLY these sections. Be specific — no fluff.

## ARCHETYPE
Classify the role: AI Platform/LLMOps | Agentic/Automation | AI Solutions Architect | AI Forward Deployed | AI Transformation | Software Engineering | Other
State archetype + 1-sentence reason.

## A) ROLE SUMMARY
| Field | Value |
|---|---|
| Archetype | ... |
| Domain | ... |
| Seniority | ... |
| Remote | ... |
| TL;DR | one sentence |

## B) CV MATCH
Map each key JD requirement to a specific line/project from the CV:
| JD Requirement | CV Evidence | Strength (Strong/Partial/Gap) |
|---|---|---|

**Gaps** subsection: list any hard blockers (no CV coverage) + mitigation.

## C) LEVEL & STRATEGY
- Detected seniority vs candidate's natural level for this archetype
- How to frame the application (specific phrases, proof points to lead with)
- If likely downleveled: acceptable and why?

## D) COMPENSATION
- Estimated salary range for this role + India/remote location
- Does it meet the candidate's target based on their profile?

## E) CV PERSONALIZATION (Top 5 changes)
| # | Section | Current | Proposed change | Why |
|---|---|---|---|---|

## F) INTERVIEW PREP (Top 5 STAR stories)
| # | JD Requirement | STAR Story | Result | Reflection |
|---|---|---|---|---|

## SCORE BREAKDOWN
Rate each dimension 1–5:
- Technical Fit: X/5 — reason
- Level Match: X/5 — reason
- Location/Remote: X/5 — reason
- Growth Potential: X/5 — reason
- Domain Fit: X/5 — reason

**OVERALL_SCORE: X.X/5**
(Tech 35% + Level 20% + Location 15% + Growth 15% + Domain 15%)

## RECOMMENDATION
APPLY NOW | APPLY WITH TWEAKS | MONITOR | SKIP — one sentence.`;
}

/**
 * Parse the overall score from an evaluation. Handles common LLM formatting
 * variants including:
 *   - `OVERALL_SCORE: 4.2/5`
 *   - `**OVERALL_SCORE:** **4.2 / 5**`
 *   - `| **OVERALL_SCORE** | **3.6 / 5** |`  (table cell)
 *   - `| **Overall Score** | **3.4/5** |`     (table cell, title-case)
 *   - `| **Overall** | **3.5 / 5** |`          (table cell, short label)
 */
export function parseScore(text: string): string | null {
  // Pattern 1 – inline / bold variants: OVERALL_SCORE: X/5 or OVERALL SCORE: X/5
  const inline = text.match(/OVERALL[_\s]SCORE[\s:*]+\**\s*([\d.]+)\s*\/\s*5/i);
  if (inline) return parseFloat(inline[1] as string).toFixed(1);

  // Pattern 2 – markdown table cell: | **Overall...** | **X.X / 5** ... |
  // Matches labels: "OVERALL_SCORE", "Overall Score", "Overall"
  const table = text.match(
    /\|\s*\**\s*Overall(?:[_\s]Score)?\s*\**\s*\|\s*\**\s*([\d.]+)\s*\/\s*5/i,
  );
  if (table) return parseFloat(table[1] as string).toFixed(1);

  return null;
}

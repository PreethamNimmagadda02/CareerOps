import { describe, expect, it } from "vitest";

import {
  parseArchetype,
  parseComp,
  parseDimensions,
  parseEvaluation,
  parseGaps,
  parseRecommendation,
} from "../src/lib/evaluation.js";

const REPORT = `# Evaluation: Acme — Senior AI Engineer

**Date:** 2026-07-01
**URL:** https://jobs.acme.com/123
**Provider:** nvidia / model-x
**Report #:** 42

---

## ARCHETYPE
**Agentic/Automation** — the role centres on building autonomous LLM workflows.

## A) ROLE SUMMARY
| Field | Value |
|---|---|
| Archetype | Agentic/Automation |
| Domain | Developer tooling |
| Seniority | Senior |
| Remote | Fully remote (India OK) |
| TL;DR | Build agent pipelines for enterprise automation. |

## B) CV MATCH
| JD Requirement | CV Evidence | Strength (Strong/Partial/Gap) |
|---|---|---|
| LLM orchestration | Built multi-agent system at X | Strong |
| Kubernetes | Deployed services on EKS | Partial |

**Gaps**
- No production Rust experience — mitigate by highlighting Go systems work.
- Limited enterprise sales exposure.

## C) LEVEL & STRATEGY
- Senior matches the candidate's level.

## D) COMPENSATION
- Estimated salary range: ₹45–60 LPA for India/remote.
- Meets the candidate's target.

## E) CV PERSONALIZATION (Top 5 changes)
| # | Section | Current | Proposed change | Why |
|---|---|---|---|---|

## F) INTERVIEW PREP (Top 5 STAR stories)
| # | JD Requirement | STAR Story | Result | Reflection |
|---|---|---|---|---|

## SCORE BREAKDOWN
- Technical Fit: 4.5/5 — strong overlap with agent tooling.
- Level Match: 4/5 — senior-for-senior.
- Location/Remote: 5/5 — fully remote.
- Growth Potential: 3.5/5 — narrow domain.
- Domain Fit: 4/5 — adjacent experience.

**OVERALL_SCORE: 4.3/5**
(Tech 35% + Level 20% + Location 15% + Growth 15% + Domain 15%)

## RECOMMENDATION
**APPLY NOW** — top-quartile fit; tailor the CV summary first.
`;

describe("parseDimensions", () => {
  it("parses all five dimensions with reasons", () => {
    const dims = parseDimensions(REPORT);
    expect(dims).toHaveLength(5);
    expect(dims[0]).toMatchObject({ key: "technical", score: 4.5, weight: 0.35 });
    expect(dims[0]?.reason).toContain("agent tooling");
    expect(dims.map((d) => d.score)).toEqual([4.5, 4, 5, 3.5, 4]);
  });

  it("parses table-cell layout", () => {
    const text = [
      "## SCORE BREAKDOWN",
      "| Dimension | Score | Why |",
      "|---|---|---|",
      "| Technical Fit | 3/5 | decent |",
      "| Level Match | 2/5 | downlevel |",
    ].join("\n");
    const dims = parseDimensions(text);
    expect(dims).toHaveLength(2);
    expect(dims[0]).toMatchObject({ key: "technical", score: 3 });
    expect(dims[1]).toMatchObject({ key: "level", score: 2 });
  });

  it("returns empty for missing section", () => {
    expect(parseDimensions("no scores here")).toEqual([]);
  });

  it("parses bold table labels with bare-number ratings (no /5)", () => {
    const text = [
      "## SCORE BREAKDOWN",
      "| Dimension | Rating (1‑5) | Reason |",
      "|-----------|-------------|--------|",
      "| **Technical Fit** | 3.5 | Strong Python; missing Terraform. |",
      "| **Level Match** | 2.0 | JD expects 5+ yr senior. |",
      "| **Location/Remote** | 5.0 | Fully remote. |",
      "| **Growth Potential** | 4.0 | High-impact early-career talent. |",
      "| **Domain Fit** | 4.0 | Aligns with audio-data work. |",
    ].join("\n");
    const dims = parseDimensions(text);
    expect(dims).toHaveLength(5);
    expect(dims.map((d) => d.score)).toEqual([3.5, 2, 5, 4, 4]);
    expect(dims[0]?.reason).toContain("missing Terraform");
  });

  it("keeps parsing when subsections use ### headings", () => {
    const text = [
      "## SCORE BREAKDOWN",
      "### Details",
      "- Technical Fit: 4/5 — good.",
      "## RECOMMENDATION",
    ].join("\n");
    expect(parseDimensions(text)).toHaveLength(1);
  });
});

describe("parseRecommendation", () => {
  it("parses the verdict and note", () => {
    const { recommendation, note } = parseRecommendation(REPORT);
    expect(recommendation).toBe("APPLY_NOW");
    expect(note).toContain("top-quartile fit");
  });

  it("prefers the longer token over its prefix", () => {
    const { recommendation } = parseRecommendation(
      "## RECOMMENDATION\nAPPLY WITH TWEAKS — fix the summary.",
    );
    expect(recommendation).toBe("APPLY_WITH_TWEAKS");
  });

  it("ignores an echoed choice list", () => {
    const { recommendation } = parseRecommendation(
      "## RECOMMENDATION\nAPPLY NOW | APPLY WITH TWEAKS | MONITOR | SKIP\n**MONITOR** — wait for a better opening.",
    );
    expect(recommendation).toBe("MONITOR");
  });

  it("returns null when absent", () => {
    expect(parseRecommendation("nothing useful").recommendation).toBeNull();
  });
});

describe("parseArchetype", () => {
  it("parses the canonical archetype", () => {
    expect(parseArchetype(REPORT)).toBe("Agentic/Automation");
  });

  it("falls back to the summary table", () => {
    const text = "## A) ROLE SUMMARY\n| Archetype | Software Engineering |\n";
    expect(parseArchetype(text)).toBe("Software Engineering");
  });
});

describe("parseComp", () => {
  it("finds the salary line in section D", () => {
    expect(parseComp(REPORT)).toContain("₹45–60 LPA");
  });

  it("returns null without money mentions", () => {
    expect(parseComp("## D) COMPENSATION\n- Unknown.\n## E) NEXT")).toBeNull();
  });
});

describe("parseGaps", () => {
  it("collects gap bullets", () => {
    const gaps = parseGaps(REPORT);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toContain("Rust");
  });

  it("returns empty when no gaps subsection", () => {
    expect(parseGaps("## B) CV MATCH\nAll strong.")).toEqual([]);
  });

  it("parses the table form under a ### Gaps heading", () => {
    const text = [
      "## B) CV MATCH",
      "| JD Requirement | CV Evidence | Strength |",
      "|---|---|---|",
      "| Security certs | None listed | **Gap** |",
      "",
      "### Gaps – Hard blockers & Mitigation",
      "| Gap | Why it matters | Mitigation |",
      "|---|---|---|",
      "| **Formal security certifications** | Screened by recruiters. | Add a security section. |",
      "| **Cloud security tooling (CSPM, SIEM)** | Core to the role. | Highlight DSPM exposure. |",
      "",
      "## C) LEVEL & STRATEGY",
    ].join("\n");
    const gaps = parseGaps(text);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toBe("Formal security certifications");
    expect(gaps[1]).toContain("CSPM");
  });
});

describe("parseEvaluation", () => {
  it("assembles the full insight set", () => {
    const e = parseEvaluation(REPORT);
    expect(e.score).toBe("4.3");
    expect(e.scoreNumeric).toBe(4.3);
    expect(e.recommendation).toBe("APPLY_NOW");
    expect(e.archetype).toBe("Agentic/Automation");
    expect(e.tldr).toContain("agent pipelines");
    expect(e.remote).toContain("Fully remote");
    expect(e.comp).toContain("LPA");
    expect(e.dimensions).toHaveLength(5);
    expect(e.gaps).toHaveLength(2);
  });

  it("degrades gracefully on unstructured text", () => {
    const e = parseEvaluation("The model refused to answer.");
    expect(e.score).toBeNull();
    expect(e.scoreNumeric).toBeNull();
    expect(e.recommendation).toBeNull();
    expect(e.dimensions).toEqual([]);
    expect(e.gaps).toEqual([]);
  });
});

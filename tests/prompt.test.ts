import { describe, expect, it } from "vitest";

import { buildPrompt, parseScore } from "../src/lib/prompt.js";

describe("buildPrompt", () => {
  it("embeds cv, profile, jd and job identity", () => {
    const prompt = buildPrompt({
      cv: "CV-CONTENT",
      profileYml: "PROFILE-YML",
      jdText: "JD-TEXT",
      company: "Acme",
      role: "AI Engineer",
    });
    expect(prompt).toContain("CV-CONTENT");
    expect(prompt).toContain("PROFILE-YML");
    expect(prompt).toContain("JD-TEXT");
    expect(prompt).toContain("Acme — AI Engineer");
    expect(prompt).toContain("OVERALL_SCORE");
  });
});

describe("parseScore", () => {
  it("parses the plain format", () => {
    expect(parseScore("OVERALL_SCORE: 4.2/5")).toBe("4.2");
  });

  it("parses bold/spaced variants", () => {
    expect(parseScore("**OVERALL_SCORE:** **4.0 / 5**")).toBe("4.0");
    expect(parseScore("OVERALL SCORE: 3/5")).toBe("3.0");
  });

  it("parses markdown table cell variants", () => {
    // OVERALL_SCORE as table cell header
    expect(parseScore("| **OVERALL_SCORE** | **3.6 / 5** (Tech 35 % ...) |")).toBe("3.6");
    // Overall Score (title-case) table cell
    expect(parseScore("| **Overall Score** | **3.4/5** (Weighted: ...) |")).toBe("3.4");
    // Overall Score with extra pipe column
    expect(parseScore("| **Overall Score** | **3.8/5** | (Tech 35% + ...). |")).toBe("3.8");
    // Overall Score with spaces around slash
    expect(parseScore("| **Overall Score** | **4.2 / 5** |")).toBe("4.2");
    // Short label 'Overall'
    expect(parseScore("| **Overall** | **3.5 / 5** (Tech 35 % ...) |")).toBe("3.5");
  });

  it("parses the weighted-calculation form", () => {
    const text = [
      "SCORE BREAKDOWN",
      "Technical Fit\t3.5 / 5\treason",
      "Level Match\t2 / 5\treason",
      "Location / Remote\t5 / 5\treason",
      "Growth Potential\t4.5 / 5\treason",
      "Domain Fit\t3 / 5\treason",
      "Overall Score (weighted)",
      "[ (3.5×0.35) + (2×0.20) + (5×0.15) + (4.5×0.15) + (3×0.15) = 3.5 / 5 ]",
    ].join("\n");
    expect(parseScore(text)).toBe("3.5");
  });

  it("parses a weighted result on the same line", () => {
    expect(parseScore("Overall Score = 4.0 / 5")).toBe("4.0");
  });

  it("parses the expanded multi-line weighted form with bold result", () => {
    const text = [
      "## SCORE BREAKDOWN",
      "| **Technical Fit** | 3 / 5 | reason |",
      "| **Level Match** | 2 / 5 | reason |",
      "| **Location/Remote** | 5 / 5 | reason |",
      "| **Growth Potential** | 4 / 5 | reason |",
      "| **Domain Fit** | 3 / 5 | reason |",
      "",
      "**Weighted Overall Score**  ",
      "(Technical 0.35 + Level 0.20 + Location 0.15 + Growth 0.15 + Domain 0.15)  ",
      "= (3×0.35) + (2×0.20) + (5×0.15) + (4×0.15) + (3×0.15)  ",
      "= **3.25 / 5**",
    ].join("\n");
    expect(parseScore(text)).toBe("3.3");
  });

  it("returns null when absent", () => {
    expect(parseScore("no score here")).toBeNull();
  });
});

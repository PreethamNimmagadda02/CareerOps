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

  it("returns null when absent", () => {
    expect(parseScore("no score here")).toBeNull();
  });
});

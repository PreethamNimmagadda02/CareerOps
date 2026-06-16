import { describe, expect, it } from "vitest";

import { hasStructuredApi, slugFromAshby, slugFromLever } from "../src/lib/scanner.js";

describe("slugFromAshby", () => {
  it("extracts the board slug", () => {
    expect(slugFromAshby("https://jobs.ashbyhq.com/acme")).toBe("acme");
    expect(slugFromAshby("https://jobs.ashbyhq.com/acme/123?x=1")).toBe("acme");
  });

  it("returns null for non-ashby urls", () => {
    expect(slugFromAshby("https://example.com")).toBeNull();
    expect(slugFromAshby(undefined)).toBeNull();
  });
});

describe("slugFromLever", () => {
  it("extracts the board slug", () => {
    expect(slugFromLever("https://jobs.lever.co/initech")).toBe("initech");
  });

  it("returns null for non-lever urls", () => {
    expect(slugFromLever("https://example.com")).toBeNull();
  });
});

describe("hasStructuredApi", () => {
  it("is true for explicit api, ashby, or lever", () => {
    expect(hasStructuredApi({ name: "a", api: "https://x" })).toBe(true);
    expect(hasStructuredApi({ name: "b", careers_url: "https://jobs.ashbyhq.com/b" })).toBe(true);
    expect(hasStructuredApi({ name: "c", careers_url: "https://jobs.lever.co/c" })).toBe(true);
  });

  it("is false for unsupported boards", () => {
    expect(hasStructuredApi({ name: "d", careers_url: "https://careers.d.com" })).toBe(false);
  });
});

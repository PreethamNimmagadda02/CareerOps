import { describe, expect, it } from "vitest";

import {
  dedupKey,
  keywordMatch,
  normalizeKey,
  normalizeUrl,
  slugify,
  today,
  unquote,
} from "../src/lib/text.js";

describe("unquote", () => {
  it("strips surrounding quotes and trims", () => {
    expect(unquote('  "hello" ')).toBe("hello");
    expect(unquote("'world'")).toBe("world");
    expect(unquote("plain")).toBe("plain");
  });
});

describe("keywordMatch", () => {
  it("requires word boundaries for ai/ml", () => {
    expect(keywordMatch("ai engineer", "ai")).toBe(true);
    expect(keywordMatch("email specialist", "ai")).toBe(false);
    expect(keywordMatch("ml engineer", "ml")).toBe(true);
    expect(keywordMatch("html developer", "ml")).toBe(false);
  });

  it("does substring match for longer keywords", () => {
    expect(keywordMatch("backend engineer", "backend")).toBe(true);
    expect(keywordMatch("frontend engineer", "backend")).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("drops query, trailing slash and lowercases", () => {
    expect(normalizeUrl("https://Example.com/Jobs/?ref=x")).toBe("https://example.com/jobs");
    expect(normalizeUrl(undefined)).toBe("");
  });
});

describe("dedupKey", () => {
  it("normalizes non-alphanumerics to single spaces", () => {
    expect(dedupKey("Acme, Inc.", "Sr. Engineer!")).toBe("acme inc sr engineer");
  });
});

describe("normalizeKey", () => {
  it("joins company and title with double pipe", () => {
    expect(normalizeKey("Acme", "AI Engineer")).toBe("acme||ai engineer");
  });
});

describe("slugify", () => {
  it("produces a url-safe slug", () => {
    expect(slugify("Hello World! 2026")).toBe("hello-world-2026");
    expect(slugify("--Trim--")).toBe("trim");
  });
});

describe("today", () => {
  it("returns an ISO date string", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

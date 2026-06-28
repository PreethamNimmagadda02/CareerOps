import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  isKeywordKind,
  normalizeKeyword,
  listKeywords,
  addKeyword,
  removeKeyword,
} from "../web/lib/keywords.ts";
import { db } from "../src/lib/db";

vi.mock("../src/lib/db", () => ({
  db: {
    filterKeyword: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const fk = db.filterKeyword as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

describe("normalizeKeyword", () => {
  it("trims and lower-cases", () => {
    expect(normalizeKeyword("  Backend Engineer  ")).toBe("backend engineer");
    expect(normalizeKeyword("AI")).toBe("ai");
  });
});

describe("isKeywordKind", () => {
  it("accepts only the two known kinds", () => {
    expect(isKeywordKind("positive")).toBe(true);
    expect(isKeywordKind("negative")).toBe(true);
    expect(isKeywordKind("neutral")).toBe(false);
    expect(isKeywordKind(undefined)).toBe(false);
    expect(isKeywordKind(42)).toBe(false);
  });
});

describe("listKeywords", () => {
  it("splits rows into positive and negative buckets for the user", async () => {
    fk.findMany.mockResolvedValueOnce([
      { kind: "positive", value: "ai" },
      { kind: "positive", value: "backend engineer" },
      { kind: "negative", value: "senior" },
    ]);

    const set = await listKeywords("user-1");

    expect(set).toEqual({
      positive: ["ai", "backend engineer"],
      negative: ["senior"],
    });
    expect(fk.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ kind: "asc" }, { value: "asc" }],
    });
  });
});

describe("addKeyword", () => {
  it("upserts on the composite key and returns the refreshed set", async () => {
    fk.upsert.mockResolvedValueOnce({});
    fk.findMany.mockResolvedValueOnce([{ kind: "positive", value: "ai" }]);

    const set = await addKeyword("user-1", "positive", "ai");

    expect(fk.upsert).toHaveBeenCalledWith({
      where: { userId_kind_value: { userId: "user-1", kind: "positive", value: "ai" } },
      update: {},
      create: { userId: "user-1", kind: "positive", value: "ai" },
    });
    expect(set.positive).toEqual(["ai"]);
    expect(fk.findMany).toHaveBeenCalledOnce();
  });
});

describe("removeKeyword", () => {
  it("deletes the matching rows and returns the refreshed set", async () => {
    fk.deleteMany.mockResolvedValueOnce({ count: 1 });
    fk.findMany.mockResolvedValueOnce([]);

    const set = await removeKeyword("user-1", "negative", "senior");

    expect(fk.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", kind: "negative", value: "senior" },
    });
    expect(set).toEqual({ positive: [], negative: [] });
  });
});

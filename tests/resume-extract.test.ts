import { describe, expect, it } from "vitest";

import { fillEmpty } from "../web/lib/resume-extract.ts";

describe("fillEmpty — scalars", () => {
  it("keeps a non-empty target value over the source", () => {
    expect(fillEmpty("typed", "extracted")).toBe("typed");
  });

  it("fills an empty-string target from the source", () => {
    expect(fillEmpty("", "extracted")).toBe("extracted");
  });

  it("treats whitespace-only target as empty", () => {
    expect(fillEmpty("   ", "extracted")).toBe("extracted");
  });

  it("returns the target when source is null", () => {
    expect(fillEmpty("typed", null as unknown as string)).toBe("typed");
  });

  it("returns the source when target is null", () => {
    expect(fillEmpty(null as unknown as string, "extracted")).toBe("extracted");
  });
});

describe("fillEmpty — arrays", () => {
  it("keeps a non-empty target array verbatim (no element merge)", () => {
    expect(fillEmpty(["a"], ["b", "c"])).toEqual(["a"]);
  });

  it("uses the source array when the target array is empty", () => {
    expect(fillEmpty([], ["b", "c"])).toEqual(["b", "c"]);
  });
});

describe("fillEmpty — objects", () => {
  it("fills only the missing/empty leaf fields and preserves user data", () => {
    const target = { name: "Ada", email: "", phone: "" };
    const source = { name: "Someone Else", email: "ada@x.com", phone: "123" };
    expect(fillEmpty(target, source)).toEqual({
      name: "Ada",
      email: "ada@x.com",
      phone: "123",
    });
  });

  it("adds keys that exist only in the source", () => {
    const target = { name: "Ada" } as Record<string, unknown>;
    const source = { name: "X", github: "ada" };
    expect(fillEmpty(target, source)).toEqual({ name: "Ada", github: "ada" });
  });

  it("merges nested objects recursively", () => {
    const target = {
      candidate: { full_name: "Ada", email: "" },
      narrative: { headline: "", superpowers: [] as string[] },
    };
    const source = {
      candidate: { full_name: "Wrong", email: "ada@x.com" },
      narrative: { headline: "Engineer", superpowers: ["fast"] },
    };
    expect(fillEmpty(target, source)).toEqual({
      candidate: { full_name: "Ada", email: "ada@x.com" },
      narrative: { headline: "Engineer", superpowers: ["fast"] },
    });
  });

  it("fills a whole empty nested object from the source", () => {
    const target = { location: { country: "", city: "" } };
    const source = { location: { country: "UK", city: "London" } };
    expect(fillEmpty(target, source)).toEqual({
      location: { country: "UK", city: "London" },
    });
  });

  it("does not mutate the original target object", () => {
    const target = { name: "Ada", email: "" };
    const snapshot = { ...target };
    fillEmpty(target, { name: "X", email: "a@b.c" });
    expect(target).toEqual(snapshot);
  });
});

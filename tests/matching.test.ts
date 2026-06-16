import { describe, expect, it } from "vitest";

import {
  engineeringMatch,
  isHighSignal,
  locationMatch,
  titleMatches,
} from "../src/lib/matching.js";

const POSITIVE = ["ai", "ml", "backend engineer", "software engineer", "platform engineer"];
const NEGATIVE = [".net", "senior", "staff", "principal", "lead"];

describe("titleMatches", () => {
  it("flags relevant titles", () => {
    const r = titleMatches("AI Engineer", POSITIVE, NEGATIVE);
    expect(r.relevant).toBe(true);
    expect(r.positive).toBe("ai");
  });

  it("rejects titles hitting a negative keyword", () => {
    const r = titleMatches("Senior Backend Engineer", POSITIVE, NEGATIVE);
    expect(r.relevant).toBe(false);
    expect(r.negative).toBe("senior");
  });

  it("rejects unrelated titles", () => {
    expect(titleMatches("Marketing Manager", POSITIVE, NEGATIVE).relevant).toBe(false);
  });
});

describe("engineeringMatch", () => {
  it("includes core engineering roles", () => {
    expect(engineeringMatch("Backend Engineer").engineering).toBe(true);
    expect(engineeringMatch("AI Engineer").engineering).toBe(true);
    expect(engineeringMatch("Forward Deployed Engineer").engineering).toBe(true);
  });

  it("excludes non-engineering roles even if they mention engineer", () => {
    expect(engineeringMatch("Sales Engineer").engineering).toBe(false);
    expect(engineeringMatch("Data Scientist").engineering).toBe(false);
    expect(engineeringMatch("Support Engineer").engineering).toBe(false);
  });
});

describe("locationMatch", () => {
  it("accepts Indian locations", () => {
    expect(locationMatch("Bengaluru, India").eligible).toBe(true);
    expect(locationMatch("Hyderabad").india).toBe(true);
  });

  it("accepts remote when not strictly foreign", () => {
    expect(locationMatch("Remote").eligible).toBe(true);
  });

  it("rejects foreign-only locations", () => {
    expect(locationMatch("San Francisco, CA").eligible).toBe(false);
    expect(locationMatch("London, UK").eligible).toBe(false);
  });

  it("accepts remote that also lists India", () => {
    expect(locationMatch("Remote (US / India)").eligible).toBe(true);
  });
});

describe("isHighSignal", () => {
  const base = { company: "Acme", url: "https://x", source: "s" };

  it("accepts a strong, friendly, junior-enough engineering role", () => {
    expect(isHighSignal({ ...base, title: "AI Engineer", location: "Bengaluru, India" })).toBe(
      true,
    );
  });

  it("rejects senior roles", () => {
    expect(
      isHighSignal({ ...base, title: "Senior Software Engineer", location: "Remote India" }),
    ).toBe(false);
  });

  it("rejects friendly location but weak title", () => {
    expect(isHighSignal({ ...base, title: "Sales Manager", location: "India" })).toBe(false);
  });

  it("rejects strong title but unfriendly location", () => {
    expect(isHighSignal({ ...base, title: "AI Engineer", location: "San Francisco" })).toBe(false);
  });
});

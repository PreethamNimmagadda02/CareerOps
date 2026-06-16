import { describe, expect, it } from "vitest";

import { parseAppLines, reportFilename, updateTracker } from "../src/lib/tracker.js";

const TABLE = `# Applications Tracker

| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |
|---|---|---|---|---|---|---|---|
| 1 | 2026-06-16 | Acme | AI Engineer | N/A | Evaluated | ❌ |  | notes |
| 2 | 2026-06-16 | Globex | Backend Engineer | 4.2/5 | Evaluated | ❌ | [002](reports/002-globex.md) |  |
`;

describe("parseAppLines", () => {
  const rows = parseAppLines(TABLE);

  it("parses only numbered data rows", () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ num: 1, company: "Acme", role: "AI Engineer", score: "N/A" });
    expect(rows[1]?.score).toBe("4.2/5");
  });

  it("skips the header/separator rows", () => {
    expect(rows.every((r) => r.num > 0)).toBe(true);
  });
});

describe("reportFilename", () => {
  it("zero-pads the number and slugifies the company", () => {
    expect(reportFilename(7, "Acme Inc", "2026-06-16")).toBe("007-acme-inc-2026-06-16.md");
  });
});

describe("updateTracker", () => {
  it("writes score and report link into the matching row", () => {
    const lines = TABLE.split("\n");
    const rows = parseAppLines(TABLE);
    const ok = updateTracker(lines, rows[0]!.raw, "3.8", 5, "Acme", "2026-06-16");
    expect(ok).toBe(true);
    const updated = lines.find((l) => l.includes("Acme"))!;
    expect(updated).toContain("3.8/5");
    expect(updated).toContain("[005](reports/005-acme-2026-06-16.md)");
  });

  it("returns false when the row is not found", () => {
    const lines = TABLE.split("\n");
    expect(updateTracker(lines, "| 99 | nope |", "1.0", 1, "X", "2026-06-16")).toBe(false);
  });
});

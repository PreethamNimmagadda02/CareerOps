import { describe, expect, it, vi, beforeEach } from "vitest";

import { reportFilename, updateTracker } from "../src/lib/tracker.js";
import { db } from "../src/lib/db.js";

vi.mock("../src/lib/db.js", () => ({
  db: {
    application: {
      update: vi.fn(),
    },
  },
}));

describe("reportFilename", () => {
  it("zero-pads the number and slugifies the company", () => {
    expect(reportFilename(7, "Acme Inc", "2026-06-16")).toBe("007-acme-inc-2026-06-16.md");
  });
});

describe("updateTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates score and report link in the database", async () => {
    vi.mocked(db.application.update).mockResolvedValue({} as any);
    
    const ok = await updateTracker(1, "3.8", 5, "Acme", "2026-06-16");
    
    expect(ok).toBe(true);
    expect(db.application.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        score: "3.8/5",
        report: "[005](reports/005-acme-2026-06-16.md)",
        updatedAt: expect.any(Date),
      },
    });
  });

  it("returns false when the database update throws an error", async () => {
    vi.mocked(db.application.update).mockRejectedValue(new Error("Not found"));
    
    const ok = await updateTracker(99, "1.0", 1, "X", "2026-06-16");
    expect(ok).toBe(false);
  });
});

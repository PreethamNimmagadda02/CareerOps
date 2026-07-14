import { describe, expect, it, vi, beforeEach } from "vitest";

import { reportFilename, updateTracker, writeReport } from "../src/lib/tracker.js";
import { db } from "../src/lib/db.js";

vi.mock("../src/lib/db.js", () => ({
  db: {
    application: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/minio.js", () => ({
  uploadReport: vi.fn().mockResolvedValue("001-acme-2026-06-16.md"),
  reportObjectUrl: vi.fn(
    (userId: string, filename: string) =>
      `https://minio.local/careerops/Reports/${userId}/${filename}`,
  ),
}));

describe("reportFilename", () => {
  it("zero-pads the number and slugifies the company", () => {
    expect(reportFilename(7, "Acme Inc", "2026-06-16")).toBe("007-acme-inc-2026-06-16.md");
  });
});

// `nextReportNumber` is now a per-user atomic `UPDATE … RETURNING` against the
// User.reportSeq column. Its correctness (uniqueness + contiguity under
// concurrency, cross-tenant independence) is inherently a real-database
// property and can't be meaningfully asserted with a mock — it's covered in
// tests/e2e/postgres-tracker.e2e.ts against the live Postgres stack.

describe("updateTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates score, report filename, and MinIO report URL for the owning user", async () => {
    vi.mocked(db.application.updateMany).mockResolvedValue({ count: 1 } as any);

    const ok = await updateTracker("app-1", "user-1", "3.8", 5, "Acme", "2026-06-16");

    expect(ok).toBe(true);
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: "app-1", userId: "user-1" },
      data: {
        score: "3.8/5",
        reportName: "005-acme-2026-06-16.md",
        reportUrl: "https://minio.local/careerops/Reports/user-1/005-acme-2026-06-16.md",
        updatedAt: expect.any(Date),
      },
    });
  });

  it("returns false when no row matches the id + user", async () => {
    vi.mocked(db.application.updateMany).mockResolvedValue({ count: 0 } as any);

    const ok = await updateTracker("missing", "user-1", "1.0", 1, "X", "2026-06-16");
    expect(ok).toBe(false);
  });
});

describe("writeReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploads to MinIO and returns the filename", async () => {
    const { uploadReport } = await import("../src/lib/minio.js");
    const filename = await writeReport({
      userId: "user-1",
      num: 1,
      company: "Acme",
      role: "Engineer",
      url: "https://acme.com/jobs/1",
      evaluation: "Great fit.",
      providerLabel: "nvidia / gpt-oss-120b",
    });
    expect(filename).toMatch(/^001-acme-\d{4}-\d{2}-\d{2}\.md$/);
    expect(uploadReport).toHaveBeenCalledOnce();
  });
});

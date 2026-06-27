import { describe, expect, it, vi, beforeEach } from "vitest";

import { reportFilename, updateTracker, writeReport, nextReportNumber } from "../src/lib/tracker.js";
import { db } from "../src/lib/db.js";

vi.mock("../src/lib/db.js", () => ({
  db: {
    application: {
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/minio.js", () => ({
  uploadReport: vi.fn().mockResolvedValue("001-acme-2026-06-16.md"),
  reportObjectUrl: vi.fn((filename: string) => `https://minio.local/careerops/${filename}`),
}));

describe("reportFilename", () => {
  it("zero-pads the number and slugifies the company", () => {
    expect(reportFilename(7, "Acme Inc", "2026-06-16")).toBe("007-acme-inc-2026-06-16.md");
  });
});

describe("nextReportNumber", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 1 when no reports exist", async () => {
    vi.mocked(db.application.findMany).mockResolvedValue([]);
    expect(await nextReportNumber()).toBe(1);
  });

  it("returns max report number + 1 for both filename and legacy link forms", async () => {
    vi.mocked(db.application.findMany).mockResolvedValue([
      { reportName: "003-acme-2026-06-16.md" } as any,
      { reportName: "[007](reports/007-globex.md)" } as any,
    ]);
    expect(await nextReportNumber()).toBe(8);
  });
});

describe("updateTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates score, report filename, and MinIO report URL in the database", async () => {
    vi.mocked(db.application.update).mockResolvedValue({} as any);

    const ok = await updateTracker(1, "3.8", 5, "Acme", "2026-06-16");

    expect(ok).toBe(true);
    expect(db.application.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        score: "3.8/5",
        reportName: "005-acme-2026-06-16.md",
        reportUrl: "https://minio.local/careerops/005-acme-2026-06-16.md",
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

describe("writeReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploads to MinIO and returns the filename", async () => {
    const { uploadReport } = await import("../src/lib/minio.js");
    const filename = await writeReport({
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

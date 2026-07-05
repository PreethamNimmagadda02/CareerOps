import { describe, expect, it, afterAll } from "vitest";

import {
  uploadReport,
  downloadReport,
  listReports,
  migrateReportKey,
  reportObjectKey,
  reportObjectUrl,
} from "../../src/lib/minio.js";
import { uploadResume, downloadResume, deleteResume } from "../../web/lib/storage.ts";
import { e2eUserId } from "./setup/fixtures.js";
import { s3Put, s3Exists, s3Delete } from "./setup/clients.js";

const userA = e2eUserId("rep-a");
const userB = e2eUserId("rep-b");
const keysToClean: string[] = [];

afterAll(async () => {
  await s3Delete(...keysToClean);
});

describe("MinIO report storage (live)", () => {
  it("uploads a report and downloads identical content", async () => {
    const filename = "001-acme-2026-06-28.md";
    const content = "# Evaluation: Acme\n\nGreat fit.\n";
    keysToClean.push(reportObjectKey(userA, filename));

    const returned = await uploadReport(userA, filename, content);
    expect(returned).toBe(filename);

    const fetched = await downloadReport(userA, filename);
    expect(fetched).toBe(content);
  });

  it("lists only the requesting user's reports (tenant isolation)", async () => {
    const fileA = "002-globex-2026-06-28.md";
    const fileB = "003-initech-2026-06-28.md";
    keysToClean.push(reportObjectKey(userA, fileA), reportObjectKey(userB, fileB));

    await uploadReport(userA, fileA, "# A");
    await uploadReport(userB, fileB, "# B");

    const listA = await listReports(userA);
    const listB = await listReports(userB);

    expect(listA).toContain(fileA);
    expect(listA).not.toContain(fileB);
    expect(listB).toContain(fileB);
    expect(listB).not.toContain(fileA);
  });

  it("returns null when downloading a missing report", async () => {
    expect(await downloadReport(userA, "does-not-exist.md")).toBeNull();
  });

  it("builds a browser-resolvable public URL", async () => {
    const url = reportObjectUrl(userA, "001-acme-2026-06-28.md");
    expect(url).toMatch(new RegExp(`/careerops/Reports/${userA}/001-acme-2026-06-28\\.md$`));
  });

  it("migrates a legacy flat-key report into the user prefix", async () => {
    const filename = "099-legacy-2026-06-28.md";
    const flatKey = filename; // legacy reports lived at the bucket root
    const scopedKey = reportObjectKey(userA, filename);
    keysToClean.push(flatKey, scopedKey);

    await s3Put(flatKey, "# Legacy report");
    expect(await s3Exists(flatKey)).toBe(true);

    await migrateReportKey(userA, filename);

    // The flat key is gone and the report is now readable under the user prefix.
    expect(await s3Exists(flatKey)).toBe(false);
    expect(await downloadReport(userA, filename)).toBe("# Legacy report");
  });
});

describe("MinIO resume storage (live)", () => {
  it("round-trips a binary resume buffer and content type", async () => {
    const user = e2eUserId("resume");
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"

    const key = await uploadResume(user, bytes, "application/pdf", "pdf");
    keysToClean.push(key);
    expect(key).toBe(`Resumes/${user}/resume.pdf`);

    const fetched = await downloadResume(key);
    expect(fetched).not.toBeNull();
    expect(fetched!.contentType).toBe("application/pdf");
    expect(Buffer.compare(fetched!.buffer, bytes)).toBe(0);
  });

  it("deletes a resume so subsequent reads return null", async () => {
    const user = e2eUserId("resume-del");
    const key = await uploadResume(user, Buffer.from("dummy"), "application/pdf", "pdf");

    expect(await downloadResume(key)).not.toBeNull();
    await deleteResume(key);
    expect(await downloadResume(key)).toBeNull();
  });
});

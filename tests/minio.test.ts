import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  reportObjectKey,
  reportObjectUrl,
  uploadReport,
  downloadReport,
  listReports,
  migrateReportKey,
} from "../src/lib/minio.js";

// Mock the S3 SDK: capture command inputs and control `send`.
const { s3send } = vi.hoisted(() => ({ s3send: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => {
  class Cmd {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: class {
      send = s3send;
    },
    PutObjectCommand: class extends Cmd {},
    GetObjectCommand: class extends Cmd {},
    ListObjectsV2Command: class extends Cmd {},
    CopyObjectCommand: class extends Cmd {},
    DeleteObjectCommand: class extends Cmd {},
  };
});

const ENV_KEYS = [
  "MINIO_ENDPOINT",
  "MINIO_PUBLIC_ENDPOINT",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.MINIO_ENDPOINT = "http://minio:9000";
  process.env.MINIO_ACCESS_KEY = "access";
  process.env.MINIO_SECRET_KEY = "secret";
  delete process.env.MINIO_PUBLIC_ENDPOINT;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("report key + url helpers", () => {
  it("namespaces report keys per user", () => {
    expect(reportObjectKey("user-1", "001-acme.md")).toBe("Reports/user-1/001-acme.md");
  });

  it("builds a public URL from MINIO_PUBLIC_ENDPOINT and trims a trailing slash", () => {
    process.env.MINIO_PUBLIC_ENDPOINT = "https://files.example.com/";
    expect(reportObjectUrl("user-1", "001-acme.md")).toBe(
      "https://files.example.com/careerops/Reports/user-1/001-acme.md",
    );
  });

  it("falls back to MINIO_ENDPOINT when no public endpoint is set", () => {
    expect(reportObjectUrl("user-1", "001-acme.md")).toBe(
      "http://minio:9000/careerops/Reports/user-1/001-acme.md",
    );
  });
});

describe("uploadReport", () => {
  it("uploads to the user-scoped key and returns just the filename", async () => {
    s3send.mockResolvedValueOnce({});
    const result = await uploadReport("user-1", "001-acme.md", "# Report");

    expect(result).toBe("001-acme.md");
    const cmd = s3send.mock.calls[0][0];
    expect(cmd.input).toMatchObject({
      Bucket: "careerops",
      Key: "Reports/user-1/001-acme.md",
      Body: "# Report",
      ContentType: "text/markdown; charset=utf-8",
    });
  });

  it("throws a configuration error when MinIO env is missing", async () => {
    delete process.env.MINIO_ENDPOINT;
    await expect(uploadReport("user-1", "f.md", "x")).rejects.toThrow(/MinIO not configured/);
    expect(s3send).not.toHaveBeenCalled();
  });
});

describe("downloadReport", () => {
  it("returns the markdown body as a string", async () => {
    s3send.mockResolvedValueOnce({
      Body: { transformToString: async () => "# Hello" },
    });
    expect(await downloadReport("user-1", "001-acme.md")).toBe("# Hello");
  });

  it("returns null when the object is missing", async () => {
    s3send.mockRejectedValueOnce(new Error("NoSuchKey"));
    expect(await downloadReport("user-1", "missing.md")).toBeNull();
  });
});

describe("listReports", () => {
  it("strips the user prefix and ignores empty keys", async () => {
    s3send.mockResolvedValueOnce({
      Contents: [
        { Key: "Reports/user-1/001-acme.md" },
        { Key: "Reports/user-1/002-globex.md" },
        { Key: "" },
        {},
      ],
    });

    const files = await listReports("user-1");
    expect(files).toEqual(["001-acme.md", "002-globex.md"]);

    const cmd = s3send.mock.calls[0][0];
    expect(cmd.input).toMatchObject({ Bucket: "careerops", Prefix: "Reports/user-1/" });
  });

  it("returns an empty array when there are no contents", async () => {
    s3send.mockResolvedValueOnce({});
    expect(await listReports("user-1")).toEqual([]);
  });
});

describe("migrateReportKey", () => {
  it("copies the flat legacy key to the user prefix then deletes the original", async () => {
    s3send.mockResolvedValue({});
    await migrateReportKey("user-1", "001-acme.md");

    expect(s3send).toHaveBeenCalledTimes(2);
    const copy = s3send.mock.calls[0][0];
    const del = s3send.mock.calls[1][0];
    expect(copy.input).toMatchObject({
      Bucket: "careerops",
      CopySource: "careerops/001-acme.md",
      Key: "Reports/user-1/001-acme.md",
    });
    expect(del.input).toMatchObject({ Bucket: "careerops", Key: "001-acme.md" });
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  resumeObjectKey,
  extFromMime,
  uploadResume,
  downloadResume,
  deleteResume,
  RESUME_MAX_BYTES,
} from "../web/lib/storage.ts";

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
    DeleteObjectCommand: class extends Cmd {},
  };
});

const ENV_KEYS = ["MINIO_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.MINIO_ENDPOINT = "http://minio:9000";
  process.env.MINIO_ACCESS_KEY = "access";
  process.env.MINIO_SECRET_KEY = "secret";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resumeObjectKey", () => {
  it("namespaces a resume per user and defaults to pdf", () => {
    expect(resumeObjectKey("user-1")).toBe("Resumes/user-1/resume.pdf");
    expect(resumeObjectKey("user-1", "docx")).toBe("Resumes/user-1/resume.docx");
  });
});

describe("extFromMime", () => {
  it("maps known résumé MIME types", () => {
    expect(extFromMime("application/pdf")).toBe("pdf");
    expect(extFromMime("application/msword")).toBe("doc");
    expect(
      extFromMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("docx");
  });

  it("falls back to pdf for unknown types", () => {
    expect(extFromMime("image/png")).toBe("pdf");
  });
});

describe("RESUME_MAX_BYTES", () => {
  it("is 10 MB", () => {
    expect(RESUME_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("uploadResume", () => {
  it("uploads to the user key with content length and returns the key", async () => {
    s3send.mockResolvedValueOnce({});
    const buf = Buffer.from("PDFDATA");
    const key = await uploadResume("user-1", buf, "application/pdf", "pdf");

    expect(key).toBe("Resumes/user-1/resume.pdf");
    const cmd = s3send.mock.calls[0][0];
    expect(cmd.input).toMatchObject({
      Bucket: "careerops",
      Key: "Resumes/user-1/resume.pdf",
      ContentType: "application/pdf",
      ContentLength: buf.length,
    });
  });

  it("throws when a custom endpoint is set without credentials", async () => {
    // Endpoint present (MinIO mode) but keys missing → fail fast instead of
    // silently using the AWS default credential chain.
    delete process.env.MINIO_ACCESS_KEY;
    delete process.env.MINIO_SECRET_KEY;
    await expect(
      uploadResume("user-1", Buffer.from("x"), "application/pdf", "pdf"),
    ).rejects.toThrow(/S3 is not configured/);
  });
});

describe("downloadResume", () => {
  it("returns the buffer and content type", async () => {
    s3send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentType: "application/pdf",
    });

    const res = await downloadResume("Resumes/user-1/resume.pdf");
    expect(res).not.toBeNull();
    expect(res!.contentType).toBe("application/pdf");
    expect(Array.from(res!.buffer)).toEqual([1, 2, 3]);
  });

  it("defaults the content type when the object omits it", async () => {
    s3send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([9]) },
    });
    const res = await downloadResume("Resumes/user-1/resume.pdf");
    expect(res!.contentType).toBe("application/octet-stream");
  });

  it("returns null when the object is missing", async () => {
    s3send.mockRejectedValueOnce(new Error("NoSuchKey"));
    expect(await downloadResume("Resumes/user-1/missing.pdf")).toBeNull();
  });

  it("returns null when the response has no body", async () => {
    s3send.mockResolvedValueOnce({});
    expect(await downloadResume("Resumes/user-1/resume.pdf")).toBeNull();
  });
});

describe("deleteResume", () => {
  it("issues a delete for the given key", async () => {
    s3send.mockResolvedValueOnce({});
    await deleteResume("Resumes/user-1/resume.pdf");
    const cmd = s3send.mock.calls[0][0];
    expect(cmd.input).toMatchObject({
      Bucket: "careerops",
      Key: "Resumes/user-1/resume.pdf",
    });
  });
});

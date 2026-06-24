/**
 * MinIO S3 integration.
 *
 * Uploads report markdown files to a MinIO bucket using the AWS S3 SDK
 * (MinIO is S3-compatible). Reads connection details from environment variables:
 *   MINIO_ENDPOINT   — e.g. http://minio:9000  (no trailing slash)
 *   MINIO_ACCESS_KEY — MinIO root user / access key
 *   MINIO_SECRET_KEY — MinIO root password / secret key
 *   MINIO_BUCKET     — bucket name (default: "careerops")
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.MINIO_BUCKET ?? "careerops";

function resolveConfig(): S3Client {
  const endpoint = (process.env.MINIO_ENDPOINT ?? "").replace(/\/$/, "");
  const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "MinIO not configured. Set MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY in .env",
    );
  }

  return new S3Client({
    endpoint,
    region: "us-east-1", // required by SDK, MinIO ignores it
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // required for MinIO
  });
}

/**
 * Upload a report markdown file to MinIO.
 *
 * @param filename — e.g. "001-acme-2026-06-22.md"
 * @param content  — full markdown text of the report
 * @returns the S3 object key of the uploaded file
 */
export async function uploadReport(filename: string, content: string): Promise<string> {
  const client = resolveConfig();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: content,
      ContentType: "text/markdown; charset=utf-8",
    }),
  );

  return filename;
}

/**
 * Download a report markdown file from MinIO by its filename.
 *
 * @param filename — e.g. "001-acme-2026-06-22.md"
 * @returns the markdown text, or null if not found
 */
export async function downloadReport(filename: string): Promise<string | null> {
  const client = resolveConfig();

  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: filename }),
    );
    return (await res.Body?.transformToString("utf-8")) ?? null;
  } catch {
    return null;
  }
}

/**
 * List all report filenames in the bucket.
 *
 * @returns array of object keys (filenames)
 */
export async function listReports(): Promise<string[]> {
  const client = resolveConfig();

  const res = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET }),
  );

  return (res.Contents ?? []).map((obj) => obj.Key ?? "").filter(Boolean);
}

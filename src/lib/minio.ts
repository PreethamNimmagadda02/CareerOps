/**
 * MinIO S3 integration — multi-tenant.
 *
 * Key layout (inside the "careerops" bucket):
 *   Reports/<userId>/<filename>   ← evaluation reports (per-user namespace)
 *   Resumes/<userId>.<ext>        ← resumes (handled in web/lib/storage.ts)
 *
 * Uploads report markdown files to a MinIO bucket using the AWS S3 SDK
 * (MinIO is S3-compatible). Reads connection details from environment variables:
 *   MINIO_ENDPOINT       — e.g. http://minio:9000  (no trailing slash)
 *   MINIO_ACCESS_KEY     — MinIO root user / access key
 *   MINIO_SECRET_KEY     — MinIO root password / secret key
 *   MINIO_BUCKET         — bucket name (default: "careerops")
 *   MINIO_PUBLIC_ENDPOINT— browser-reachable endpoint for public URLs
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.MINIO_BUCKET ?? "careerops";

/** Build the MinIO object key for a user's report. */
export function reportObjectKey(userId: string, filename: string): string {
  return `Reports/${userId}/${filename}`;
}

/**
 * Build the public URL for a report stored in MinIO.
 *
 * @param userId   — the owner's user id
 * @param filename — e.g. "001-acme-2026-06-22.md"
 */
export function reportObjectUrl(userId: string, filename: string): string {
  const endpoint = (
    process.env.MINIO_PUBLIC_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? ""
  ).replace(/\/$/, "");
  return `${endpoint}/${BUCKET}/${reportObjectKey(userId, filename)}`;
}

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
    forcePathStyle: true, // required for MinIO path-style access
  });
}

/**
 * Upload a report markdown file to MinIO, scoped under the user's prefix.
 *
 * @param userId   — the owner's user id
 * @param filename — e.g. "001-acme-2026-06-22.md"
 * @param content  — full markdown text of the report
 * @returns the full S3 object key of the uploaded file
 */
export async function uploadReport(
  userId: string,
  filename: string,
  content: string,
): Promise<string> {
  const client = resolveConfig();
  const key = reportObjectKey(userId, filename);

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: content,
      ContentType: "text/markdown; charset=utf-8",
    }),
  );

  return filename; // callers store only the filename; userId is implicit
}

/**
 * Download a report markdown file from MinIO by its filename.
 *
 * @param userId   — the owner's user id
 * @param filename — e.g. "001-acme-2026-06-22.md"
 * @returns the markdown text, or null if not found
 */
export async function downloadReport(
  userId: string,
  filename: string,
): Promise<string | null> {
  const client = resolveConfig();
  const key = reportObjectKey(userId, filename);

  try {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return (await res.Body?.transformToString("utf-8")) ?? null;
  } catch {
    return null;
  }
}

/**
 * List all report filenames for a specific user.
 *
 * @param userId — the owner's user id
 * @returns array of filenames (not full keys), e.g. ["001-acme.md", …]
 */
export async function listReports(userId: string): Promise<string[]> {
  const client = resolveConfig();
  const prefix = `Reports/${userId}/`;

  const res = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }),
  );

  return (res.Contents ?? [])
    .map((obj) => obj.Key ?? "")
    .filter(Boolean)
    .map((key) => key.slice(prefix.length)); // strip prefix → just the filename
}

/**
 * Copy a flat-key report (legacy) to the user-scoped prefix.
 * Used by the migration script only.
 *
 * @param userId   — destination user id
 * @param filename — e.g. "001-acme-2026-06-22.md" (flat key in the bucket)
 */
export async function migrateReportKey(
  userId: string,
  filename: string,
): Promise<void> {
  const client = resolveConfig();
  const srcKey = filename;
  const dstKey = reportObjectKey(userId, filename);

  await client.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${srcKey}`,
      Key: dstKey,
    }),
  );

  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: srcKey }));
}

/**
 * MinIO S3 helpers for binary file storage (resumes, attachments).
 *
 * Mirrors the pattern in src/lib/minio.ts but lives in the web layer so it
 * can be imported by Next.js route handlers without bundler issues.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.MINIO_BUCKET ?? "careerops";
const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB

export const RESUME_MAX_BYTES = MAX_RESUME_BYTES;

/**
 * Build an S3 client that targets MinIO (custom endpoint + static keys) in dev
 * or real AWS S3 (native endpoint + IAM task role) in production. Driven
 * entirely by env vars — see src/lib/s3-client.ts for the full contract.
 */
function resolveClient(): S3Client {
  const endpoint = (process.env.MINIO_ENDPOINT ?? "").replace(/\/$/, "");
  const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "";

  const region =
    process.env.S3_REGION ??
    process.env.AWS_REGION ??
    process.env.DYNAMODB_REGION ??
    "us-east-1";

  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE === undefined
      ? true
      : ["true", "1"].includes(process.env.S3_FORCE_PATH_STYLE.toLowerCase());

  const config: ConstructorParameters<typeof S3Client>[0] = { region, forcePathStyle };

  if (endpoint) config.endpoint = endpoint;

  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  } else if (endpoint) {
    throw new Error(
      "S3 is not configured. With MINIO_ENDPOINT set you must also set " +
        "MINIO_ACCESS_KEY and MINIO_SECRET_KEY. For real AWS S3, leave " +
        "MINIO_ENDPOINT unset and grant the task an IAM role.",
    );
  }

  return new S3Client(config);
}

/** Derive the MinIO key for a user's resume. */
export function resumeObjectKey(userId: string, ext = "pdf"): string {
  return `Resumes/${userId}/resume.${ext}`;
}

/**
 * Upload a resume buffer to MinIO.
 * Returns the object key used.
 */
export async function uploadResume(
  userId: string,
  buffer: Buffer,
  contentType: string,
  ext: string,
): Promise<string> {
  const client = resolveClient();
  const key = resumeObjectKey(userId, ext);

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    }),
  );

  return key;
}

/**
 * Download a resume from MinIO.
 * Returns { buffer, contentType } or null if not found.
 */
export async function downloadResume(
  key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const client = resolveClient();

  try {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

/** Delete a resume object from MinIO. */
export async function deleteResume(key: string): Promise<void> {
  const client = resolveClient();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Derive the file extension from a MIME type. Falls back to "pdf". */
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return map[mime] ?? "pdf";
}

/**
 * Shared S3 client factory used by both the report store (src/lib/minio.ts)
 * and the resume store (web/lib/storage.ts).
 *
 * The same code talks to MinIO in local/dev and to real Amazon S3 in
 * production. The behaviour is controlled entirely by environment variables so
 * no code change is needed between environments:
 *
 *   MINIO_ENDPOINT        Custom endpoint (MinIO). LEAVE UNSET for real AWS S3
 *                         so the SDK uses the native regional S3 endpoint.
 *   MINIO_ACCESS_KEY      Access key. Optional on AWS — when unset the default
 *                         AWS credential provider chain (IAM task role) is used.
 *   MINIO_SECRET_KEY      Secret key. Optional on AWS (see above).
 *   S3_REGION             Bucket region. Falls back to AWS_REGION /
 *                         DYNAMODB_REGION / "us-east-1".
 *   S3_FORCE_PATH_STYLE   "true" (default) for MinIO path-style access.
 *                         Set "false" for real S3 (virtual-hosted style).
 *
 * Production (AWS) recommended config:
 *   - MINIO_ENDPOINT unset
 *   - MINIO_ACCESS_KEY / MINIO_SECRET_KEY unset (use the ECS task IAM role)
 *   - S3_REGION=<your bucket region>
 *   - S3_FORCE_PATH_STYLE=false
 */

import { S3Client } from "@aws-sdk/client-s3";

/** Resolve the bucket region from env, with sensible fallbacks. */
export function resolveS3Region(): string {
  return (
    process.env.S3_REGION ??
    process.env.AWS_REGION ??
    process.env.DYNAMODB_REGION ??
    "us-east-1"
  );
}

/** Whether to use path-style addressing (required by MinIO, not by S3). */
function usePathStyle(): boolean {
  const v = process.env.S3_FORCE_PATH_STYLE;
  if (v === undefined) return true; // default keeps MinIO/dev working
  return v.toLowerCase() === "true" || v === "1";
}

/**
 * Build an S3Client that works against MinIO (custom endpoint + static keys)
 * or real AWS S3 (native endpoint + IAM task role credentials).
 */
export function createS3Client(): S3Client {
  const endpoint = (process.env.MINIO_ENDPOINT ?? "").replace(/\/$/, "");
  const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "";

  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: resolveS3Region(),
    forcePathStyle: usePathStyle(),
  };

  // Custom endpoint only when explicitly set (MinIO). On AWS, omitting this
  // lets the SDK pick the correct regional S3 endpoint automatically.
  if (endpoint) config.endpoint = endpoint;

  // Static credentials only when both are provided (MinIO / explicit keys).
  // On AWS leave them unset to use the ECS task role via the default chain.
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  } else if (endpoint) {
    // A custom endpoint without credentials is almost always a misconfig.
    throw new Error(
      "S3 not configured. With MINIO_ENDPOINT set you must also set " +
        "MINIO_ACCESS_KEY and MINIO_SECRET_KEY. For real AWS S3, leave " +
        "MINIO_ENDPOINT unset and grant the task an IAM role.",
    );
  }

  return new S3Client(config);
}

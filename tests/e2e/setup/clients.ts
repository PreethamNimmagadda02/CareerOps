/**
 * Raw datastore clients for E2E setup/teardown (seeding fixtures, asserting
 * low-level presence, and cleaning up after tests). These deliberately bypass
 * the app's library helpers so we can verify the helpers independently.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLE_CV, TABLE_PROFILE } from "../../../src/lib/dynamo.js";

export const BUCKET = process.env.MINIO_BUCKET ?? "careerops";

export function rawS3(): S3Client {
  return new S3Client({
    endpoint: (process.env.MINIO_ENDPOINT ?? "http://localhost:9000").replace(/\/$/, ""),
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "admin",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? "careerops123",
    },
    forcePathStyle: true,
  });
}

export async function s3Put(key: string, body: string | Buffer): Promise<void> {
  await rawS3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));
}

export async function s3Exists(key: string): Promise<boolean> {
  try {
    await rawS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function s3Delete(...keys: string[]): Promise<void> {
  const client = rawS3();
  await Promise.all(
    keys.map((Key) =>
      client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key })).catch(() => undefined),
    ),
  );
}

/** Delete a CV record straight from DynamoDB (teardown helper). */
export async function deleteCVItem(userId: string): Promise<void> {
  await ddb
    .send(new DeleteCommand({ TableName: TABLE_CV, Key: { PK: `CV#${userId}`, SK: "v1" } }))
    .catch(() => undefined);
}

/** Delete a Profile record straight from DynamoDB (teardown helper). */
export async function deleteProfileItem(userId: string): Promise<void> {
  await ddb
    .send(
      new DeleteCommand({ TableName: TABLE_PROFILE, Key: { PK: `PROFILE#${userId}`, SK: "v1" } }),
    )
    .catch(() => undefined);
}

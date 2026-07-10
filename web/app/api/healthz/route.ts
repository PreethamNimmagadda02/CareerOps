import { NextResponse } from "next/server";

import { db } from "../../../../src/lib/db";
import { ddb } from "../../../../src/lib/dynamo";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { resolveConfig as resolveMinioConfig } from "../../../../src/lib/minio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Simple health‑check that verifies connectivity to all external services. */
export async function GET() {
  const errors: string[] = [];

  // 1️⃣ PostgreSQL – a cheap SELECT 1 query via Prisma.
  try {
    // Prisma lazy connects; a raw query forces a round‑trip.
    await db.$queryRaw`SELECT 1`;
  } catch (e) {
    errors.push("postgres");
  }

  // 2️⃣ DynamoDB – list tables (lightweight) to ensure the client works.
  try {
    await ddb.send(new ListTablesCommand({}));
  } catch (e) {
    errors.push("dynamodb");
  }

  // 3️⃣ MinIO – attempt to list a single object (bucket must exist).
  try {
    const client = resolveMinioConfig(); // throws if config missing
    await client.send(new ListObjectsV2Command({ Bucket: process.env.MINIO_BUCKET ?? "careerops", MaxKeys: 1 }));
  } catch (e) {
    errors.push("minio");
  }

  if (errors.length) {
    return NextResponse.json({ status: "unhealthy", errors }, { status: 503 });
  }

  return NextResponse.json({ status: "ok" });
}

/**
 * E2E global setup: fail fast (once) with an actionable message if any of the
 * docker-compose services are unreachable, so a missing stack produces a clear
 * error instead of dozens of confusing per-test timeouts.
 */
import "dotenv/config";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";

export default async function setup(): Promise<void> {
  const problems: string[] = [];

  // ── MinIO ──────────────────────────────────────────────────────────────────
  const minioEndpoint = (process.env.MINIO_ENDPOINT ?? "http://localhost:9000").replace(/\/$/, "");
  try {
    const res = await fetch(`${minioEndpoint}/minio/health/live`);
    if (!res.ok) problems.push(`MinIO health check returned ${res.status} (${minioEndpoint})`);
  } catch {
    problems.push(`MinIO unreachable at ${minioEndpoint}`);
  }

  // ── DynamoDB Local ───────────────────────────────────────────────────────────
  try {
    const { ddb } = await import("../../../src/lib/dynamo.js");
    const out = await ddb.send(new ListTablesCommand({}));
    const tables = out.TableNames ?? [];
    const cv = process.env.DYNAMODB_TABLE_CV ?? "CVs";
    const profile = process.env.DYNAMODB_TABLE_PROFILE ?? "Profiles";
    if (!tables.includes(cv) || !tables.includes(profile)) {
      problems.push(
        `DynamoDB is up but missing tables (${cv}, ${profile}). Run: npm run dynamo:init`,
      );
    }
  } catch {
    problems.push(`DynamoDB unreachable at ${process.env.DYNAMODB_ENDPOINT ?? "(unset)"}`);
  }

  // ── Postgres ────────────────────────────────────────────────────────────────
  try {
    const { db } = await import("../../../src/lib/db.js");
    await db.$queryRaw`SELECT 1`;
  } catch {
    problems.push(
      "Postgres unreachable via DATABASE_URL (run prisma migrations if the schema is missing)",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      "E2E prerequisites not met:\n" +
        problems.map((p) => `  • ${p}`).join("\n") +
        "\n\nStart the stack first:\n" +
        "  docker compose up -d\n" +
        "  npm run dynamo:init   # creates DynamoDB tables\n",
    );
  }
}

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  // Pool size must be tuned per deployment topology, not left at the pg default
  // of 10. When N stateless web/worker instances each open their own pool,
  // total connections = N × max — which trivially exhausts Postgres at scale.
  // Behind a connection pooler (PgBouncer / RDS Proxy) keep this small per
  // instance and let the proxy multiplex; DATABASE_POOL_MAX makes it explicit.
  const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 10);
  // Force SSL for AWS RDS, but not for local Docker Postgres, which has SSL
  // disabled — it refuses the connection outright rather than negotiating
  // down. Same AWS-presence signal already used by resolveMinioClient()
  // (web/lib/reports.ts) to distinguish real S3 from local MinIO.
  const isAws = Boolean(process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV);
  const pool = new Pool({
    connectionString,
    max: poolMax,
    // Reap idle connections so a scaled-in instance releases them promptly.
    idleTimeoutMillis: Number(process.env.DATABASE_POOL_IDLE_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DATABASE_POOL_CONN_TIMEOUT_MS ?? 10_000),
    ssl: isAws ? { rejectUnauthorized: false } : false,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const db = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = db;
}

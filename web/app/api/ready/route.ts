/**
 * Readiness probe.
 *
 * Verifies the task can actually serve traffic by checking its critical
 * dependency: the Postgres database. Returns 503 when the DB is unreachable so
 * the ALB target group pulls this task out of rotation WITHOUT restarting it
 * (transient DB blips shouldn't trigger a crash-loop). Liveness lives at
 * /api/health.
 */
import { db } from "../../../../src/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ready", db: "ok", ts: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      {
        status: "not-ready",
        db: "error",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

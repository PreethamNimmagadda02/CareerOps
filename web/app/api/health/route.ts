/**
 * Liveness probe.
 *
 * Returns 200 as long as the Node process is up and able to serve HTTP. It does
 * NOT touch the database or any downstream dependency — a failing liveness
 * check tells the orchestrator (ECS/ALB) to RESTART the task, so it must only
 * fail when the process itself is wedged. Use /api/ready for dependency checks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { status: "ok", uptime: process.uptime(), ts: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

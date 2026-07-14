import { enqueueJob, latestActiveJobForUser } from "../../../../../src/lib/jobs";
import { isPipelineCommand } from "../../../../../src/lib/pipeline-commands";
import { rateLimitCooldown } from "@/lib/kv";
import { preflightPipeline } from "@/lib/preflight";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Enqueue a pipeline run. The heavy Playwright/LLM work no longer runs in this
 * request (or on the web node at all) — a worker process claims the job from
 * the queue and executes it, streaming progress into the job row. The client
 * polls `GET /api/pipeline/jobs/:id` for status + output.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ command: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return new Response("Unauthorized\n", { status: 401 });

  const { command } = await params;
  if (!isPipelineCommand(command)) {
    return Response.json({ error: `Invalid pipeline command: ${command}` }, { status: 400 });
  }

  // Rate limit — one pipeline start per 10 seconds per user. Redis-backed when
  // REDIS_URL is set so the limit holds across every web instance.
  const RATE_LIMIT_MS = 10_000;
  const { limited, retryAfterMs } = await rateLimitCooldown(`pipeline:${userId}`, RATE_LIMIT_MS);
  if (limited) {
    return Response.json(
      { error: "Too many requests – please wait before starting another pipeline." },
      { status: 429, headers: { "Retry-After": `${Math.ceil(retryAfterMs / 1000)}` } },
    );
  }

  // Pre-flight: refuse to enqueue scans without keywords or evaluations without
  // a complete profile, so we never queue a run that's guaranteed to fail.
  const blocked = await preflightPipeline(command, userId);
  if (blocked) {
    return Response.json({ error: blocked }, { status: 422 });
  }

  // Single-flight: a user can only have one active (Queued/Running) job at a
  // time. Without this, a double-click or a slow round trip (the client-side
  // guard only engages after this request resolves) can queue duplicate,
  // expensive scan/evaluate runs. Reuse the existing job instead of erroring
  // so a retried click just reattaches to what's already in flight.
  const active = await latestActiveJobForUser(userId);
  if (active) {
    return Response.json({ jobId: active.id, status: active.status }, { status: 202 });
  }

  const job = await enqueueJob(userId, command);
  return Response.json({ jobId: job.id, status: job.status }, { status: 202 });
}

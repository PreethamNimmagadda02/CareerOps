/**
 * Durable pipeline job queue backed by Postgres.
 *
 * The web tier enqueues a job and returns immediately; one or more worker
 * processes claim queued jobs with `SELECT … FOR UPDATE SKIP LOCKED`, so any
 * number of workers can pull concurrently without ever handing the same job to
 * two of them. State (status, rolling log, heartbeat) lives on the row, which
 * the dashboard polls instead of holding a long-lived HTTP stream.
 *
 * The claim + heartbeat model gives at-least-once delivery with crash recovery:
 * a worker that dies mid-job stops heart-beating, and `reclaimStaleJobs()`
 * returns the row to the queue. Swapping Postgres for SQS later means replacing
 * `enqueueJob`/`claimNextJob` with SQS send/receive — the rest is unchanged.
 */
import type { Job, JobStatus } from "@prisma/client";

import { db } from "./db.js";
import { type PipelineCommand } from "./pipeline-commands.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Job ids are Postgres `uuid` columns — a non-UUID string thrown at a query
 * makes Prisma raise "invalid input syntax for type uuid" rather than return
 * an empty result. Routes should check this and return a clean 404 instead of
 * letting that throw surface as an unhandled 500.
 */
export function isValidJobId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Keep the stored log bounded so a chatty run can't bloat the row. */
export const JOB_LOG_MAX_BYTES = 64 * 1024;

/** Trim a log to the last JOB_LOG_MAX_BYTES, prefixed with an elision marker. */
export function capLog(log: string): string {
  if (log.length <= JOB_LOG_MAX_BYTES) return log;
  let start = log.length - JOB_LOG_MAX_BYTES;
  // Don't split a surrogate pair: if the cut lands on a low surrogate, its
  // high surrogate (at start-1) is being dropped, so drop this half too.
  const code = log.charCodeAt(start);
  if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  return "…[earlier output trimmed]\n" + log.slice(start);
}

/** Enqueue a pipeline run for a user. Returns the created (Queued) job. */
export async function enqueueJob(userId: string, command: PipelineCommand): Promise<Job> {
  return db.job.create({ data: { userId, command } });
}

/**
 * Atomically claim the oldest queued job and mark it Running. Uses
 * `FOR UPDATE SKIP LOCKED` so concurrent workers never collide. Returns null
 * when the queue is empty.
 */
export async function claimNextJob(): Promise<Job | null> {
  const rows = await db.$queryRaw<Job[]>`
    UPDATE "Job"
    SET status = 'Running',
        "startedAt" = COALESCE("startedAt", now()),
        "heartbeatAt" = now(),
        attempts = attempts + 1,
        "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'Queued'
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Persist the current log and bump the heartbeat. Returns whether a cancel has
 * been requested, so the worker can stop the child promptly.
 *
 * `attempts` fences the write: it's the value `claimNextJob` bumped to when
 * *this* worker claimed the row. If the job was since reclaimed (its
 * heartbeat went stale and another worker claimed it, bumping `attempts`
 * again), this write matches zero rows and returns null — signaling a caller
 * whose claim is no longer valid (e.g. a revived "dead" worker) to stop
 * instead of clobbering the new owner's progress.
 */
export async function heartbeatJob(
  id: string,
  attempts: number,
  log: string,
): Promise<{ cancelRequested: boolean } | null> {
  const rows = await db.$queryRaw<Array<{ cancelRequested: boolean }>>`
    UPDATE "Job"
    SET log = ${capLog(log)}, "heartbeatAt" = now(), "updatedAt" = now()
    WHERE id = ${id}::uuid AND status = 'Running' AND attempts = ${attempts}
    RETURNING "cancelRequested"
  `;
  if (rows.length === 0) return null;
  return { cancelRequested: rows[0].cancelRequested };
}

/**
 * Mark a job terminal (Succeeded / Failed / Canceled) with its final log.
 * Fenced the same way as `heartbeatJob` — returns false (no-op) if the row
 * was reclaimed out from under this caller.
 */
export async function finishJob(
  id: string,
  attempts: number,
  status: Extract<JobStatus, "Succeeded" | "Failed" | "Canceled">,
  opts: { exitCode?: number | null; error?: string | null; log: string },
): Promise<boolean> {
  const result = await db.job.updateMany({
    where: { id, attempts, status: "Running" },
    data: {
      status,
      exitCode: opts.exitCode ?? null,
      error: opts.error ?? null,
      log: capLog(opts.log),
      finishedAt: new Date(),
    },
  });
  return result.count > 0;
}

/**
 * Return jobs stuck in Running with a stale heartbeat to the queue (or fail
 * them once they exhaust their attempt budget). Called periodically by workers
 * so a crashed worker's job doesn't hang forever.
 */
export async function reclaimStaleJobs(staleMs: number, maxAttempts = 3): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  // Exhausted attempts → Failed; otherwise back to Queued for another worker.
  const failed = await db.job.updateMany({
    where: { status: "Running", heartbeatAt: { lt: cutoff }, attempts: { gte: maxAttempts } },
    data: { status: "Failed", error: "Worker died; attempts exhausted", finishedAt: new Date() },
  });
  const requeued = await db.job.updateMany({
    where: { status: "Running", heartbeatAt: { lt: cutoff }, attempts: { lt: maxAttempts } },
    data: { status: "Queued", heartbeatAt: null },
  });
  return failed.count + requeued.count;
}

/** Fetch one job scoped to its owner (dashboard polling). */
export async function getJobForUser(userId: string, id: string): Promise<Job | null> {
  return db.job.findFirst({ where: { id, userId } });
}

/** The user's most recent non-terminal (Queued/Running) job, if any. */
export async function latestActiveJobForUser(userId: string): Promise<Job | null> {
  return db.job.findFirst({
    where: { userId, status: { in: ["Queued", "Running"] } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Request cancellation of a user's job. A Queued job is canceled immediately; a
 * Running job is flagged so the owning worker kills the child at its next
 * heartbeat. Returns false when there's no matching non-terminal job.
 */
export async function requestCancelJob(userId: string, id: string): Promise<boolean> {
  const canceledQueued = await db.job.updateMany({
    where: { id, userId, status: "Queued" },
    data: { status: "Canceled", finishedAt: new Date() },
  });
  if (canceledQueued.count > 0) return true;

  const flaggedRunning = await db.job.updateMany({
    where: { id, userId, status: "Running" },
    data: { cancelRequested: true },
  });
  return flaggedRunning.count > 0;
}

/**
 * Pipeline worker (scale-out mode, PIPELINE_MODE=sqs).
 *
 * Long-polls the SQS pipeline queue and executes each job as a child process,
 * exactly like the web dashboard does in inline mode — except it runs on its
 * own autoscaled ECS service so a burst of "Scan" clicks can't starve the web
 * tier. Progress is streamed back to the browser by persisting log lines to the
 * PipelineRun row, which the web tier tails.
 *
 * Lifecycle per message:
 *   1. mark PipelineRun running
 *   2. spawn the CLI (node dist/cli/<cmd>.js) with CAREER_OPS_USER_ID injected
 *   3. append stdout/stderr to PipelineRun.logs (buffered)
 *   4. mark succeeded/failed + exitCode, then delete the SQS message
 *
 * Failure handling:
 *   - A non-zero CLI exit is a deterministic, business-level failure: we record
 *     it and DELETE the message (retrying won't help).
 *   - An infrastructure error (spawn failed, DB unreachable) leaves the message
 *     on the queue so SQS redelivers it and, after maxReceiveCount, routes it to
 *     the dead-letter queue.
 *
 * Graceful shutdown: on SIGTERM/SIGINT we stop polling, let the in-flight job
 * finish (ECS gives the task stopTimeout seconds), then exit.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { db } from "../lib/db.js";
import { log } from "../lib/logger.js";
import { resolveCommand } from "../lib/pipeline-commands.js";
import { deleteJob, receiveJobs, type PipelineJob } from "../lib/sqs.js";

const REPO_ROOT = process.env.CAREER_OPS_ROOT ?? process.cwd();
const VISIBILITY_SECONDS = Number(process.env.PIPELINE_VISIBILITY_SECONDS ?? "900");
const FLUSH_MS = 1000;
const FLUSH_BYTES = 8 * 1024;

let shuttingDown = false;

/** Append text to a PipelineRun's logs atomically (no read-modify-write race). */
async function appendLogs(jobId: string, chunk: string): Promise<void> {
  if (!chunk) return;
  await db.$executeRaw`
    UPDATE "PipelineRun"
       SET "logs" = "logs" || ${chunk}, "updatedAt" = now()
     WHERE "id" = ${jobId}`;
}

/** Run a single job to completion. Returns true if the message should be deleted. */
async function processJob(job: PipelineJob): Promise<boolean> {
  const { jobId, command, userId } = job;

  // Claim the run. If the row is gone (user deleted it), drop the message.
  const run = await db.pipelineRun.findUnique({ where: { id: jobId } });
  if (!run) {
    log.warn(`[worker] no PipelineRun ${jobId}; discarding message`);
    return true;
  }

  await db.pipelineRun.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date() },
  });

  const { cmd, args } = resolveCommand(command, true);
  log.step(`[worker] job ${jobId} → ${cmd} ${args.join(" ")} (user ${userId})`);
  await appendLogs(jobId, `$ ${cmd} ${args.join(" ")}\n`);

  // Buffer log lines and flush on an interval / size threshold to bound DB writes.
  let buffer = "";
  let flushTimer: NodeJS.Timeout | null = null;
  const flush = async () => {
    if (!buffer) return;
    const pending = buffer;
    buffer = "";
    try {
      await appendLogs(jobId, pending);
    } catch (err) {
      log.error(`[worker] log flush failed for ${jobId}: ${(err as Error).message}`);
    }
  };
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_MS);
  };
  const enqueue = (line: string) => {
    buffer += line + "\n";
    if (buffer.length >= FLUSH_BYTES) void flush();
    else scheduleFlush();
  };

  const child = spawn(cmd, args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      npm_config_progress: "false",
      CAREER_OPS_USER_ID: userId,
    },
  });

  const rlOut = createInterface({ input: child.stdout!, crlfDelay: Infinity });
  const rlErr = createInterface({ input: child.stderr!, crlfDelay: Infinity });
  rlOut.on("line", (l) => enqueue(l));
  rlErr.on("line", (l) => enqueue(l));

  const exitCode: number = await new Promise((resolve) => {
    child.on("error", (err) => {
      enqueue(`[error] ${err.message}`);
      resolve(-1);
    });
    child.on("close", (code) => resolve(code ?? -1));
  });

  if (flushTimer) clearTimeout(flushTimer);
  enqueue(`\n[done] exited with code ${exitCode}`);
  await flush();

  const ok = exitCode === 0;
  await db.pipelineRun.update({
    where: { id: jobId },
    data: {
      status: ok ? "succeeded" : "failed",
      exitCode,
      finishedAt: new Date(),
      error: ok ? null : `Pipeline exited with code ${exitCode}`,
    },
  });

  log.step(`[worker] job ${jobId} ${ok ? "succeeded" : "failed"} (code ${exitCode})`);
  // Deterministic outcome either way → acknowledge the message.
  return true;
}

async function loop(): Promise<void> {
  log.info("[worker] CareerOps pipeline worker started; polling SQS…");
  while (!shuttingDown) {
    let received;
    try {
      received = await receiveJobs({ waitSeconds: 20, visibilitySeconds: VISIBILITY_SECONDS });
    } catch (err) {
      log.error(`[worker] receive failed: ${(err as Error).message}`);
      await sleep(5000);
      continue;
    }
    if (!received) continue;

    const { message, job } = received;
    try {
      const ack = await processJob(job);
      if (ack && message.ReceiptHandle) await deleteJob(message.ReceiptHandle);
    } catch (err) {
      // Infrastructure failure — do NOT delete; let SQS redrive to the DLQ.
      log.error(`[worker] job ${job.jobId} crashed: ${(err as Error).message}`);
      try {
        await db.pipelineRun.update({
          where: { id: job.jobId },
          data: { status: "failed", error: (err as Error).message, finishedAt: new Date() },
        });
      } catch {
        /* best-effort */
      }
    }
  }
  log.info("[worker] shut down cleanly.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`[worker] received ${sig}; finishing in-flight job then exiting…`);
  });
}

loop().catch((err) => {
  log.error(`[worker] fatal: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * CareerOps pipeline worker.
 *
 * Polls the Postgres job queue, claims queued scan/evaluate jobs (one at a time
 * per loop, `WORKER_CONCURRENCY` loops per process, and any number of process
 * replicas — all coordinated by `FOR UPDATE SKIP LOCKED`), and runs the heavy
 * Playwright/LLM CLI here on the worker tier instead of on the web nodes.
 *
 * Output is streamed line-by-line into the job row's `log`; the dashboard polls
 * it. A cancel request flagged on the row is honored at the next heartbeat by
 * killing the child. A crashed worker's job is reclaimed once its heartbeat
 * goes stale.
 *
 * When idle, a slot's poll interval backs off up to WORKER_MAX_POLL_MS so N
 * replicas don't hammer an empty queue — but a freshly enqueued job doesn't
 * have to wait that out: enqueueJob() publishes a pub/sub nudge (see
 * ../lib/job-signal.ts) that wakes any idle slot immediately when REDIS_URL
 * is set. Purely a latency optimization; polling remains the fallback.
 *
 * Env:
 *   WORKER_CONCURRENCY   parallel job loops per process (default 2)
 *   WORKER_POLL_MS       idle poll interval (default 2000)
 *   WORKER_MAX_POLL_MS   idle poll backoff ceiling (default 10000)
 *   WORKER_HEARTBEAT_MS  log-flush / cancel-check cadence (default 2000)
 *   WORKER_STALE_MS      Running heartbeat age before reclaim (default 120000)
 *   REDIS_URL            enables the job-queued nudge (optional)
 */
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import type { Job } from "@prisma/client";

import { db } from "../lib/db.js";
import { subscribeJobQueued } from "../lib/job-signal.js";
import {
  claimNextJob,
  finishJob,
  heartbeatJob,
  reclaimStaleJobs,
} from "../lib/jobs.js";
import { log } from "../lib/logger.js";
import { isPipelineCommand, resolveCommandProcess } from "../lib/pipeline-commands.js";

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2));
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS ?? 2000);
const STALE_MS = Number(process.env.WORKER_STALE_MS ?? 120_000);
// Independent of any slot's claim/run loop, so reclaim isn't delayed by a
// long-running job occupying slot 0. A fraction of STALE_MS keeps reclaim
// responsive without polling the table needlessly often.
const RECLAIM_INTERVAL_MS = Number(process.env.WORKER_RECLAIM_MS ?? Math.max(15_000, STALE_MS / 4));

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Lets an idle workLoop's wait be cut short the moment a job is enqueued
// (see ../lib/job-signal.ts), instead of always sleeping out its current
// backoff interval. Shared across every slot in this process — whichever
// slot's claimNextJob() actually wins the row doesn't matter, since the rest
// just find nothing and fall back to idling again.
const wakeEmitter = new EventEmitter();
wakeEmitter.setMaxListeners(CONCURRENCY + 1);

/** Sleep up to `ms`, resolving early (with `true`) if a wake signal arrives. */
function idleWait(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onWake = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      wakeEmitter.off("wake", onWake);
      resolve(false);
    }, ms);
    wakeEmitter.once("wake", onWake);
  });
}

/** Run a single claimed job to completion, streaming output into its log. */
async function runJob(job: Job): Promise<void> {
  const { id, userId, command, attempts } = job;

  if (!isPipelineCommand(command)) {
    const msg = `Unknown pipeline command: ${command}`;
    await finishJob(id, attempts, "Failed", { error: msg, log: msg });
    return;
  }

  const { cmd, args } = resolveCommandProcess(command);
  let buffer = `$ ${cmd} ${args.join(" ")}\n`;
  const append = (line: string) => {
    buffer += line + "\n";
  };

  const child = spawn(cmd, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      npm_config_progress: "false",
      // Attribute every scanned/evaluated row to the job's owner.
      CAREER_OPS_USER_ID: userId,
    },
  });

  const rlOut = createInterface({ input: child.stdout!, crlfDelay: Infinity });
  const rlErr = createInterface({ input: child.stderr!, crlfDelay: Infinity });
  rlOut.on("line", append);
  rlErr.on("line", append);

  // Heartbeat: flush the log and honor cancellation while the child runs.
  // Chained (not fire-and-forget) so ticks can't land out of order, and its
  // promise is tracked so we can wait for the last one before finishing.
  let canceled = false;
  let fenced = false;
  let heartbeatChain: Promise<void> = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatChain = heartbeatChain
      .then(() => heartbeatJob(id, attempts, buffer))
      .then((result) => {
        if (result === null) {
          // This job was reclaimed (heartbeat went stale) and re-claimed by
          // another worker — our attempts token no longer matches. Stop
          // immediately rather than keep running a job someone else owns now.
          if (!fenced && !canceled) {
            fenced = true;
            log.error(`⛔ [job ${id}] fenced off — reclaimed by another worker, killing child`);
            child.kill("SIGTERM");
          }
          return;
        }
        if (result.cancelRequested && !canceled) {
          canceled = true;
          append("\n[canceled] stopping…");
          child.kill("SIGTERM");
        }
      })
      .catch(() => {
        /* transient DB error — retry on the next tick */
      });
  }, HEARTBEAT_MS);

  const exitCode = await new Promise<number>((resolve) => {
    child.on("error", (err) => {
      append(`\n[error] ${err.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 0));
  });
  clearInterval(heartbeat);
  // Wait for any heartbeat write still in flight so it can't land after — and
  // overwrite — the terminal write below.
  await heartbeatChain;

  if (fenced) {
    log.error(`⛔ [job ${id}] not finishing — no longer the owner`);
    return;
  }

  if (canceled) {
    append(`\n[done] canceled (exit ${exitCode})`);
    await finishJob(id, attempts, "Canceled", { exitCode, log: buffer });
  } else if (exitCode === 0) {
    append("\n[done] exited with code 0");
    await finishJob(id, attempts, "Succeeded", { exitCode, log: buffer });
  } else {
    append(`\n[done] exited with code ${exitCode}`);
    await finishJob(id, attempts, "Failed", { exitCode, error: `Exited with code ${exitCode}`, log: buffer });
  }
}

// Idle-poll backoff ceiling. Without this, N replicas idling forever each
// hit claimNextJob every POLL_INTERVAL_MS — DB load scales with replica
// count even with an empty queue. Doubling up to this ceiling keeps a claim
// attempt frequent right after activity while capping steady-state idle load.
const MAX_POLL_INTERVAL_MS = Number(process.env.WORKER_MAX_POLL_MS ?? 10_000);

/** A single claim→run→repeat loop. Multiple run concurrently per process. */
async function workLoop(slot: number): Promise<void> {
  let idlePollMs = POLL_INTERVAL_MS;
  while (!shuttingDown) {
    try {
      const job = await claimNextJob();
      if (!job) {
        const woken = await idleWait(idlePollMs);
        // A wake means something just changed (a job was queued) — the
        // backoff's "nothing's happening" assumption no longer holds, so
        // reset to the fast interval instead of continuing to grow it.
        idlePollMs = woken ? POLL_INTERVAL_MS : Math.min(idlePollMs * 2, MAX_POLL_INTERVAL_MS);
        continue;
      }
      idlePollMs = POLL_INTERVAL_MS;
      log.info(`▶️  [slot ${slot}] job ${job.id} — ${job.command} (user ${job.userId})`);
      await runJob(job);
      log.info(`🏁 [slot ${slot}] job ${job.id} done`);
    } catch (err) {
      log.error(`[slot ${slot}] loop error: ${(err as Error).message}`);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function main(): Promise<void> {
  log.info(`👷 worker started — concurrency=${CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms`);

  const stop = (sig: string) => {
    log.info(`↩️  ${sig} received — finishing in-flight jobs then exiting`);
    shuttingDown = true;
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  // No-op when REDIS_URL isn't set — idle slots just keep polling on their
  // own schedule, as before.
  subscribeJobQueued(() => wakeEmitter.emit("wake"));

  // Reclaim of jobs abandoned by crashed workers runs on its own timer so a
  // long-running job in any one slot never delays it.
  const reclaimTimer = setInterval(() => {
    reclaimStaleJobs(STALE_MS).catch((err: unknown) =>
      log.error(`[reclaim] error: ${(err as Error).message}`),
    );
  }, RECLAIM_INTERVAL_MS);

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => workLoop(i)));
  clearInterval(reclaimTimer);
  await db.$disconnect();
  log.info("👋 worker stopped");
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});

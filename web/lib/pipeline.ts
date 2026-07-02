import { spawn, ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

import { db } from "../../src/lib/db";
import { enqueuePipelineJob, sqsEnabled } from "../../src/lib/sqs";
import { repoPaths } from "./paths";

export type PipelineCommand = "scan" | "scan:fallback" | "evaluate" | "evaluate:all" | "evaluate:dry";

const isProd = process.env.NODE_ENV === "production";

const ALLOWED: Record<PipelineCommand, { cmd: string; args: string[] }> = {
  scan: isProd
    ? { cmd: "node", args: ["dist/cli/scan.js", "--compact", "--concurrency", "12"] }
    : { cmd: "npm", args: ["run", "scan"] },
  "scan:fallback": isProd
    ? { cmd: "node", args: ["dist/cli/scan.js", "--compact", "--fallback", "--concurrency", "12", "--browser-concurrency", "12"] }
    : { cmd: "npm", args: ["run", "scan:fallback"] },
  evaluate: isProd
    ? { cmd: "node", args: ["dist/cli/evaluate.js", "--limit", "5", "--concurrency", "12"] }
    : { cmd: "npm", args: ["run", "evaluate"] },
  "evaluate:all": isProd
    ? { cmd: "node", args: ["dist/cli/evaluate.js", "--limit", "100", "--concurrency", "12"] }
    : { cmd: "npm", args: ["run", "evaluate:all"] },
  "evaluate:dry": isProd
    ? { cmd: "node", args: ["dist/cli/evaluate.js", "--limit", "5", "--dry-run", "--concurrency", "12"] }
    : { cmd: "npm", args: ["run", "evaluate:dry"] },
};

/**
 * Spawn an npm pipeline script at the repo root and return a streaming text
 * response body.
 *
 * Buffering strategy:
 *  - readline is used on both stdout and stderr so every completed line is
 *    enqueued immediately.
 *  - The CLI logger writes everything to stderr (via process.stderr.write) which
 *    Node.js flushes per-call — unlike stdout which is block-buffered (~4 KB)
 *    when connected to a pipe.
 *  - cancel() sets the closed flag and SIGTERMs the child when the client
 *    disconnects, avoiding unhandled promise rejections on aborted streams.
 */
export function runPipeline(command: PipelineCommand, userId: string): ReadableStream<Uint8Array> {
  // Scale-out mode: hand the job to the worker fleet via SQS and tail the
  // resulting PipelineRun row. The browser still receives a live text stream,
  // so no UI change is required. Falls back to inline spawning by default.
  if (sqsEnabled()) return runPipelineViaQueue(command, userId);
  return runPipelineInline(command, userId);
}

function runPipelineInline(command: PipelineCommand, userId: string): ReadableStream<Uint8Array> {
  const pipelineConfig = ALLOWED[command];
  if (!pipelineConfig) throw new Error(`Unknown pipeline command: ${command}`);

  const encoder = new TextEncoder();

  // Hoisted so both start() and cancel() share the same references.
  let closed = false;
  let child: ChildProcess | null = null;

  const abort = () => {
    if (closed) return;
    closed = true;
    child?.kill("SIGTERM");
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(text));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      send(`$ ${pipelineConfig.cmd} ${pipelineConfig.args.join(" ")}\n`);

      child = spawn(pipelineConfig.cmd, pipelineConfig.args, {
        cwd: repoPaths.root,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          npm_config_progress: "false",
          // Attribute every scanned/evaluated job to the signed-in user so the
          // pipeline writes into that user's isolated dataset.
          CAREER_OPS_USER_ID: userId,
        },
      });

      const rlOut = createInterface({ input: child.stdout!, crlfDelay: Infinity });
      const rlErr = createInterface({ input: child.stderr!, crlfDelay: Infinity });

      rlOut.on("line", (line) => send(line + "\n"));
      rlErr.on("line", (line) => send(line + "\n"));

      child.on("error", (err) => {
        send(`\n[error] ${err.message}\n`);
        close();
      });

      child.on("close", (code) => {
        send(`\n[done] exited with code ${code}\n`);
        close();
      });
    },

    // Called when the HTTP client disconnects or the response is aborted.
    cancel() {
      abort();
    },
  });
}

// Terminal PipelineRun statuses — polling stops once the run reaches one of these.
const TERMINAL = new Set(["succeeded", "failed", "canceled"]);
const POLL_MS = 800;
const MAX_POLL_MS = 820_000; // safety ceiling slightly above the route maxDuration

/**
 * Scale-out path: create a PipelineRun row, enqueue an SQS job for the worker
 * fleet, then stream the row's accumulating `logs` back to the browser until the
 * run reaches a terminal status. Preserves the same text/plain streaming
 * contract as the inline path.
 */
function runPipelineViaQueue(command: PipelineCommand, userId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      let jobId: string;
      try {
        const run = await db.pipelineRun.create({ data: { userId, command, status: "queued" } });
        jobId = run.id;
        await enqueuePipelineJob({ jobId, command, userId });
      } catch (err) {
        send(`\n[error] failed to enqueue pipeline job: ${(err as Error).message}\n`);
        close();
        return;
      }

      send(`$ queued ${command} (job ${jobId})\n`);

      const startedAt = Date.now();
      let cursor = 0;
      while (!closed) {
        if (Date.now() - startedAt > MAX_POLL_MS) {
          send("\n[warn] stopped tailing after timeout; the job continues in the background.\n");
          break;
        }
        await sleep(POLL_MS);

        let run;
        try {
          run = await db.pipelineRun.findUnique({
            where: { id: jobId },
            select: { logs: true, status: true },
          });
        } catch {
          continue; // transient DB blip — retry on the next tick
        }
        if (!run) {
          send("\n[error] pipeline run disappeared.\n");
          break;
        }

        if (run.logs.length > cursor) {
          send(run.logs.slice(cursor));
          cursor = run.logs.length;
        }
        if (TERMINAL.has(run.status)) break;
      }

      close();
    },

    cancel() {
      // The client disconnected; the worker keeps running server-side. We simply
      // stop tailing — the run is still recorded in the PipelineRun row.
      closed = true;
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

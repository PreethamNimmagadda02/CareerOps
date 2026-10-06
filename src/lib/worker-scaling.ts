/**
 * Scale-to-zero for the job worker when it runs as an ECS service.
 *
 * The worker is idle almost all of the time, so in production it only runs
 * while there is work: `enqueueJob` asks ECS for one worker task, and the
 * worker asks ECS to stop it again once it has been idle for a while (see the
 * idle watchdog in `src/worker/index.ts`). The price is a cold start — about a
 * minute — for the first job after an idle spell.
 *
 * Enabled only when both `ECS_CLUSTER_NAME` and `WORKER_SERVICE_NAME` are set.
 * Everywhere else (local dev, docker compose) every function here is a no-op
 * and the worker simply runs forever, as before.
 */
import { ECSClient, UpdateServiceCommand } from "@aws-sdk/client-ecs";

import { log } from "./logger.js";

let client: ECSClient | undefined;

function target(): { cluster: string; service: string } | null {
  const cluster = process.env.ECS_CLUSTER_NAME;
  const service = process.env.WORKER_SERVICE_NAME;
  return cluster && service ? { cluster, service } : null;
}

export function workerScalingEnabled(): boolean {
  return target() !== null;
}

async function setDesiredCount(desiredCount: number): Promise<void> {
  const t = target();
  if (!t) return;
  client ??= new ECSClient({});
  await client.send(new UpdateServiceCommand({ ...t, desiredCount }));
}

/**
 * Make sure a worker task is running or starting. Idempotent — asking for one
 * when one already exists changes nothing. Never throws: a failed request must
 * not fail the enqueue; the job stays Queued until a worker next starts.
 */
export async function ensureWorkerRunning(): Promise<void> {
  try {
    await setDesiredCount(1);
  } catch (err) {
    log.warn(`[worker-scaling] could not start worker: ${(err as Error).message}`);
  }
}

/**
 * Stop the worker if nothing is Queued or Running. Resolves to whether the
 * worker is now stopping.
 *
 * A job enqueued between the first count and the scale-down had its own
 * "start a worker" request overwritten by ours, so the queue is counted again
 * afterwards and the worker re-requested if anything turned up.
 */
export async function scaleToZeroIfDrained(countPending: () => Promise<number>): Promise<boolean> {
  if ((await countPending()) > 0) return false;
  await setDesiredCount(0);
  if ((await countPending()) > 0) {
    await ensureWorkerRunning();
    return false;
  }
  return true;
}

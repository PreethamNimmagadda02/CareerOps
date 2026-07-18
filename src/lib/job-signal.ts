/**
 * Best-effort pub/sub nudge so a freshly enqueued job doesn't have to wait out
 * the worker's idle-poll backoff (up to `WORKER_MAX_POLL_MS`, default 20s —
 * see `src/worker/index.ts`) before being noticed.
 *
 * This is purely a latency optimization, never a correctness requirement: the
 * worker's own polling loop remains the source of truth and self-heals if a
 * publish is dropped, arrives before any worker has subscribed, or
 * `REDIS_URL` isn't set at all (e.g. plain local dev) — in every one of those
 * cases the job simply gets picked up on the next scheduled poll instead of
 * immediately.
 */
import { Redis } from "ioredis";
import { log } from "./logger.js";

const CHANNEL = "career-ops:job-queued";

// undefined = not yet resolved; null = disabled (no REDIS_URL); Redis = active.
let publisher: Redis | null | undefined;

function publisherClient(): Redis | null {
  if (publisher !== undefined) return publisher;
  const url = process.env.REDIS_URL;
  if (!url) {
    publisher = null;
    return null;
  }
  publisher = new Redis(url, {
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 1500,
  });
  publisher.on("error", (err) => log.warn(`[job-signal] publish client error: ${(err as Error).message}`));
  return publisher;
}

/** Nudge any idle worker to check the queue right now. Never throws. */
export async function notifyJobQueued(): Promise<void> {
  const r = publisherClient();
  if (!r) return;
  try {
    await r.publish(CHANNEL, "1");
  } catch (err) {
    log.warn(`[job-signal] publish failed: ${(err as Error).message}`);
  }
}

/**
 * Subscribe for job-queued notifications, invoking `onSignal` on each one.
 * A no-op when `REDIS_URL` isn't set — the caller's own polling stays the
 * only signal in that case.
 */
export function subscribeJobQueued(onSignal: () => void): void {
  const url = process.env.REDIS_URL;
  if (!url) return;

  // ioredis requires a connection dedicated to subscriber mode — it can no
  // longer issue other commands once subscribed, so this is separate from
  // publisherClient() above.
  const subscriber = new Redis(url, {
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
  });
  subscriber.on("error", (err) =>
    log.warn(`[job-signal] subscribe client error: ${(err as Error).message}`),
  );
  subscriber.on("message", (channel) => {
    if (channel === CHANNEL) onSignal();
  });
  subscriber.subscribe(CHANNEL).catch((err: unknown) =>
    log.warn(`[job-signal] subscribe failed: ${(err as Error).message}`),
  );
}

import Redis from "ioredis";

/**
 * Shared key-value layer for cross-instance state (rate limits, caches).
 *
 * When `REDIS_URL` is set we use a single Redis so state is shared across every
 * web instance — the prerequisite for running more than one node behind a load
 * balancer. When it is NOT set we transparently fall back to per-process
 * in-memory structures, preserving the previous single-node behavior with zero
 * infra. Every Redis call is wrapped so a Redis hiccup degrades to the
 * in-memory path rather than failing the request.
 */

// undefined = not yet resolved; null = disabled (no REDIS_URL); Redis = active.
let redis: Redis | null | undefined;

function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    redis = null;
    return null;
  }
  redis = new Redis(url, {
    // Queue commands issued before the connection is ready and flush them on
    // connect — otherwise the first requests after boot silently bypass Redis.
    enableOfflineQueue: true,
    // But fail fast on a genuinely unreachable/hung Redis so we degrade to the
    // in-memory path instead of hanging the request.
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 1500,
  });
  redis.on("error", (err) => console.warn("[kv] redis error:", (err as Error).message));
  return redis;
}

// ── Rate limiting (fixed cooldown window) ────────────────────────────────────

const memCooldown = new Map<string, number>(); // key → cooldown-expiry epoch ms

export interface RateLimitResult {
  limited: boolean;
  retryAfterMs: number;
}

/**
 * Allow one action per `windowMs` for `key`. Atomic in Redis via `SET NX PX`,
 * so it holds across instances; falls back to an in-memory map otherwise.
 */
export async function rateLimitCooldown(key: string, windowMs: number): Promise<RateLimitResult> {
  const r = client();
  if (r) {
    try {
      const k = `rl:${key}`;
      const ok = await r.set(k, "1", "PX", windowMs, "NX");
      if (ok === "OK") return { limited: false, retryAfterMs: 0 };
      const ttl = await r.pttl(k);
      return { limited: true, retryAfterMs: ttl > 0 ? ttl : windowMs };
    } catch {
      /* fall through to in-memory */
    }
  }
  const now = Date.now();
  const expiresAt = memCooldown.get(key) ?? 0;
  if (expiresAt > now) return { limited: true, retryAfterMs: expiresAt - now };
  memCooldown.set(key, now + windowMs);
  return { limited: false, retryAfterMs: 0 };
}

// ── JSON cache with TTL ──────────────────────────────────────────────────────

const memCache = new Map<string, { value: unknown; expiresAt: number }>();

export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  const r = client();
  if (r) {
    try {
      const raw = await r.get(`cache:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      /* fall through to in-memory */
    }
  }
  const hit = memCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  return null;
}

export async function cacheSetJSON(key: string, value: unknown, ttlSec: number): Promise<void> {
  const r = client();
  if (r) {
    try {
      await r.set(`cache:${key}`, JSON.stringify(value), "EX", ttlSec);
      return;
    } catch {
      /* fall through to in-memory */
    }
  }
  memCache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

// ── In-memory fallback eviction ──────────────────────────────────────────────
//
// This path is only exercised without REDIS_URL, or whenever Redis errors —
// exactly the condition under which it must NOT also leak. Without this sweep
// every distinct rate-limit/cache key (one per user per action, forever)
// accumulates in these process-local maps with no eviction.

const SWEEP_INTERVAL_MS = 60_000;

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of memCooldown) {
    if (expiresAt <= now) memCooldown.delete(key);
  }
  for (const [key, entry] of memCache) {
    if (entry.expiresAt <= now) memCache.delete(key);
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref(); // don't keep the process alive just for this

import { existsSync, readFileSync } from "node:fs";

import OpenAI from "openai";

import type { ProviderConfig } from "../types.js";
import { paths } from "./paths.js";

/** Built-in providers, always available without extra config. */
const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
  zen: {
    baseURL: "https://opencode.ai/zen/v1",
    defaultModel: "deepseek-v4-flash-free",
    authEnvVar: "OPENCODE_API_KEY",
  },
  nvidia: {
    baseURL: "https://integrate.api.nvidia.com/v1",
    defaultModel: "openai/gpt-oss-120b",
    authEnvVar: "NVIDIA_API_KEY",
  },
};

/** Read and parse `~/.config/opencode/opencode.jsonc`, stripping comments. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadOpencodeConfig(configPath: string = paths.opencodeConfig): Record<string, any> {
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, "utf8")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Resolve a provider by name. Checks built-ins first, then custom providers
 * defined in the user's opencode config. Throws if the provider is unknown.
 */
export function resolveProvider(providerArg: string): ProviderConfig {
  const builtin = BUILTIN_PROVIDERS[providerArg];
  if (builtin) return builtin;

  const cfg = loadOpencodeConfig();
  const custom = cfg.provider?.[providerArg];
  if (custom) {
    const models = Object.keys(custom.models || {});
    return {
      baseURL: custom.options?.baseURL,
      defaultModel: models[0] || "default",
      authEnvVar: "OPENCODE_API_KEY",
    };
  }

  const available = [...Object.keys(BUILTIN_PROVIDERS), ...Object.keys(cfg.provider || {})];
  throw new Error(
    `Unknown provider "${providerArg}". Available: ${available.join(", ") || "(none)"}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Transient failures worth retrying: rate limits, timeouts, 5xx, network. */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 408 || status === 409 || status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  // Network-level errors from the SDK / undici (no HTTP status).
  const name = (err as { name?: string })?.name ?? "";
  const code = (err as { code?: string })?.code ?? "";
  if (/APIConnection|Timeout/i.test(name)) return true;
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|EAI_AGAIN/.test(code)) return true;
  return false;
}

/** Honor a provider `Retry-After` (seconds or HTTP-date) when present. */
function retryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: Record<string, string> })?.headers;
  const raw = headers?.["retry-after"];
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/**
 * Send a single-turn chat completion and return the message content.
 *
 * Retries transient failures (429 rate limits, 5xx, timeouts, connection
 * resets) with exponential backoff + jitter, honoring a `Retry-After` header
 * when the provider sends one. This matters at scale: many workers share one
 * provider quota, so rate limits are the common case, not the exception.
 * Tunable via CAREER_OPS_LLM_MAX_RETRIES / CAREER_OPS_LLM_TIMEOUT_MS.
 */
export async function callLLM(opts: {
  prompt: string;
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const maxRetries = Number(process.env.CAREER_OPS_LLM_MAX_RETRIES ?? 4);
  const timeout = Number(process.env.CAREER_OPS_LLM_TIMEOUT_MS ?? 60_000);
  // We manage retries ourselves (maxRetries: 0) so backoff is explicit + logged.
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 0, timeout });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model: opts.model,
        messages: [{ role: "user", content: opts.prompt }],
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4096,
      });
      return resp.choices[0]?.message?.content || "";
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isRetryable(err)) break;
      // Prefer the server's Retry-After; else exponential backoff (cap 30s) + jitter.
      const backoff = retryAfterMs(err) ?? Math.min(30_000, 500 * 2 ** attempt);
      await sleep(backoff + Math.floor(Math.random() * 250));
    }
  }
  throw lastErr;
}

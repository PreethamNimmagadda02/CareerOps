import { existsSync, readFileSync } from "node:fs";

import OpenAI from "openai";

import type { ProviderConfig } from "../types.js";
import { paths } from "./paths.js";

/** Built-in providers, always available without extra config. */
export const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
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
export function loadOpencodeConfig(configPath: string = paths.opencodeConfig): Record<string, any> {
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

/** Send a single-turn chat completion and return the message content. */
export async function callLLM(opts: {
  prompt: string;
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  const resp = await client.chat.completions.create({
    model: opts.model,
    messages: [{ role: "user", content: opts.prompt }],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
  });
  return resp.choices[0]?.message?.content || "";
}

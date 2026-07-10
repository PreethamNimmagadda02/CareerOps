import { existsSync, readFileSync } from "node:fs";

import { paths } from "./paths.js";

const ENV_LINE = /^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/;

/**
 * Load variables from the project `.env` file into `process.env` without
 * overwriting values that are already set. Idempotent and dependency-free.
 */
export function loadEnv(envPath: string = paths.env): void {
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(ENV_LINE);
    if (!match) continue;
    const [, key, value] = match;
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}


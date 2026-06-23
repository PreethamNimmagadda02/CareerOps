import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the project root by walking up from this module until a directory
 * containing `package.json` is found. Works whether the code runs from `src/`
 * (via tsx) or from compiled `dist/`.
 */
function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const PROJECT_ROOT = findProjectRoot();

const p = (...segments: string[]): string => path.join(PROJECT_ROOT, ...segments);

export const paths = {
  root: PROJECT_ROOT,
  cv: p("cv.md"),
  env: p(".env"),
  profile: p("config", "profile.yml"),
  dataDir: p("data"),
  pipeline: p("data", "pipeline.md"),
  scanHistory: p("data", "scan-history.tsv"),
  fontsDir: p("fonts"),
  opencodeConfig: path.join(os.homedir(), ".config", "opencode", "opencode.jsonc"),
} as const;

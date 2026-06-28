import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Resolve the CareerOps repository root. The web app lives in `web/`, so we
 * walk up from the current working directory looking for the marker files that
 * identify the project root. Can be overridden with CAREER_OPS_ROOT.
 */
function findRepoRoot(): string {
  const override = process.env.CAREER_OPS_ROOT;
  if (override && existsSync(override)) return override;

  let dir = process.cwd();
  for (let i = 0; i < 10; i += 1) {
    const hasPrisma = existsSync(path.join(dir, "prisma", "schema.prisma"));
    const hasPkg = existsSync(path.join(dir, "package.json"));
    if (hasPrisma && hasPkg) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: parent of web/
  return path.resolve(process.cwd(), "..");
}

export const REPO_ROOT = findRepoRoot();

const p = (...segments: string[]): string => path.join(REPO_ROOT, ...segments);

export const repoPaths = {
  root: REPO_ROOT,
  scanHistory: p("data", "scan-history.tsv"),
} as const;

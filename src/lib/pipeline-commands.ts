/**
 * Canonical pipeline command catalogue.
 *
 * Single source of truth shared by:
 *   - the web producer (web/lib/pipeline.ts) — validates the requested command
 *   - the worker consumer (src/worker/index.ts) — turns a command into the
 *     actual child-process invocation
 *
 * Keep this in sync with the npm scripts in package.json.
 */

export type PipelineCommand =
  | "scan"
  | "scan:fallback"
  | "evaluate"
  | "evaluate:all"
  | "evaluate:dry";

export const PIPELINE_COMMANDS: readonly PipelineCommand[] = [
  "scan",
  "scan:fallback",
  "evaluate",
  "evaluate:all",
  "evaluate:dry",
] as const;

export function isPipelineCommand(value: string): value is PipelineCommand {
  return (PIPELINE_COMMANDS as readonly string[]).includes(value);
}

export interface CommandInvocation {
  cmd: string;
  args: string[];
}

/**
 * Resolve a pipeline command to a concrete child-process invocation.
 *
 * @param command  one of PIPELINE_COMMANDS
 * @param isProd   when true, run the compiled CLI (dist/cli/*.js) directly;
 *                 otherwise defer to the npm scripts (tsx) for local dev.
 */
export function resolveCommand(command: PipelineCommand, isProd: boolean): CommandInvocation {
  const prod: Record<PipelineCommand, CommandInvocation> = {
    scan: { cmd: "node", args: ["dist/cli/scan.js", "--compact", "--concurrency", "12"] },
    "scan:fallback": {
      cmd: "node",
      args: [
        "dist/cli/scan.js",
        "--compact",
        "--fallback",
        "--concurrency",
        "12",
        "--browser-concurrency",
        "12",
      ],
    },
    evaluate: { cmd: "node", args: ["dist/cli/evaluate.js", "--limit", "5", "--concurrency", "12"] },
    "evaluate:all": {
      cmd: "node",
      args: ["dist/cli/evaluate.js", "--limit", "100", "--concurrency", "12"],
    },
    "evaluate:dry": {
      cmd: "node",
      args: ["dist/cli/evaluate.js", "--limit", "5", "--dry-run", "--concurrency", "12"],
    },
  };

  if (isProd) return prod[command];
  return { cmd: "npm", args: ["run", command] };
}

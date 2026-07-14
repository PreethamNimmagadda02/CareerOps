/**
 * Pipeline command definitions, shared by the web tier (which enqueues jobs)
 * and the worker tier (which runs them). Keeping this in `src/lib` — rather than
 * in the Next.js `web/` tree — lets the standalone worker import it without
 * reaching across the web bundle.
 */

export const PIPELINE_COMMANDS = [
  "scan",
  "scan:fallback",
  "evaluate",
  "evaluate:all",
  "evaluate:dry",
] as const;

export type PipelineCommand = (typeof PIPELINE_COMMANDS)[number];

export function isPipelineCommand(value: string): value is PipelineCommand {
  return (PIPELINE_COMMANDS as readonly string[]).includes(value);
}

/**
 * The concrete child process to run for a command. In production this executes
 * on the worker tier (`node dist/cli/*`); in dev it runs the tsx npm script.
 * The heavy Playwright/LLM work happens here — never on the web nodes.
 */
export function resolveCommandProcess(command: PipelineCommand): { cmd: string; args: string[] } {
  const isProd = process.env.NODE_ENV === "production";
  const map: Record<PipelineCommand, { cmd: string; args: string[] }> = {
    scan: isProd
      ? { cmd: "node", args: ["dist/cli/scan.js", "--compact", "--concurrency", "12"] }
      : { cmd: "npm", args: ["run", "scan"] },
    "scan:fallback": isProd
      ? {
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
        }
      : { cmd: "npm", args: ["run", "scan:fallback"] },
    evaluate: isProd
      ? { cmd: "node", args: ["dist/cli/evaluate.js", "--limit", "5", "--concurrency", "12"] }
      : { cmd: "npm", args: ["run", "evaluate"] },
    "evaluate:all": isProd
      ? { cmd: "node", args: ["dist/cli/evaluate.js", "--limit", "99999", "--concurrency", "12"] }
      : { cmd: "npm", args: ["run", "evaluate:all"] },
    "evaluate:dry": isProd
      ? {
          cmd: "node",
          args: ["dist/cli/evaluate.js", "--limit", "5", "--dry-run", "--concurrency", "12"],
        }
      : { cmd: "npm", args: ["run", "evaluate:dry"] },
  };
  return map[command];
}

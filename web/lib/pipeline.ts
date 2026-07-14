/**
 * The web tier no longer spawns pipeline processes. Scan/evaluate runs are
 * enqueued as durable jobs (`POST /api/pipeline/[command]`) and executed on the
 * worker tier (see `src/worker/`), keeping Playwright/Chromium/LLM work off the
 * web nodes so they stay stateless and horizontally scalable.
 *
 * This module now only re-exports the shared command type/helpers so existing
 * `@/lib/pipeline` imports keep working.
 */
export {
  PIPELINE_COMMANDS,
  isPipelineCommand,
  type PipelineCommand,
} from "../../src/lib/pipeline-commands";

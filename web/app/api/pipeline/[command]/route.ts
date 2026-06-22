import { runPipeline, type PipelineCommand } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pipelines (scan/evaluate) can run for a while.
export const maxDuration = 800;

const VALID: PipelineCommand[] = ["scan", "scan:fallback", "evaluate", "evaluate:all", "evaluate:dry"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ command: string }> },
) {
  const { command } = await params;
  if (!VALID.includes(command as PipelineCommand)) {
    return new Response(`Invalid pipeline command: ${command}\n`, { status: 400 });
  }

  const stream = runPipeline(command as PipelineCommand);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      // Chrome buffers `text/plain` streamed responses while it MIME-sniffs the
      // first bytes. `nosniff` disables that sniffing so lines render live.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

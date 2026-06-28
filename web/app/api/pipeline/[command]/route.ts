import { runPipeline, type PipelineCommand } from "@/lib/pipeline";
import { preflightPipeline } from "@/lib/preflight";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pipelines (scan/evaluate) can run for a while.
export const maxDuration = 800;

const VALID: PipelineCommand[] = ["scan", "scan:fallback", "evaluate", "evaluate:all", "evaluate:dry"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ command: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return new Response("Unauthorized\n", { status: 401 });

  const { command } = await params;
  if (!VALID.includes(command as PipelineCommand)) {
    return new Response(`Invalid pipeline command: ${command}\n`, { status: 400 });
  }

  // Pre-flight: refuse to start scans without keywords or evaluations without a
  // complete profile, so we never spawn a process that's guaranteed to fail.
  const blocked = await preflightPipeline(command as PipelineCommand, userId);
  if (blocked) {
    return new Response(`${blocked}\n`, {
      status: 422,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const stream = runPipeline(command as PipelineCommand, userId);
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

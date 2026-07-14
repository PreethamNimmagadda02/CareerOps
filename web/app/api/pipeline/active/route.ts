import { latestActiveJobForUser } from "../../../../../src/lib/jobs";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The user's most recent still-running (Queued/Running) job, if any. Lets the
 * dashboard reattach to an in-flight run after a page reload instead of losing
 * the live console.
 */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const job = await latestActiveJobForUser(userId);
  return Response.json({
    job: job ? { id: job.id, command: job.command, status: job.status } : null,
  });
}

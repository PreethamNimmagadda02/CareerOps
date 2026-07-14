import { isValidJobId, requestCancelJob } from "../../../../../../../src/lib/jobs";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request cancellation of a job. A queued job is canceled immediately; a running
 * job is flagged and stopped by its worker at the next heartbeat.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidJobId(id)) return Response.json({ error: "No cancelable job found" }, { status: 404 });
  const ok = await requestCancelJob(userId, id);
  if (!ok) return Response.json({ error: "No cancelable job found" }, { status: 404 });

  return Response.json({ ok: true });
}

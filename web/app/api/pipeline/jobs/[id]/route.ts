import { getJobForUser, isValidJobId } from "../../../../../../src/lib/jobs";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll a job's status + captured log. Scoped to the signed-in owner. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidJobId(id)) return Response.json({ error: "Job not found" }, { status: 404 });
  const job = await getJobForUser(userId, id);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  const done = ["Succeeded", "Failed", "Canceled"].includes(job.status);
  return Response.json({
    id: job.id,
    command: job.command,
    status: job.status,
    log: job.log,
    exitCode: job.exitCode,
    error: job.error,
    done,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });
}

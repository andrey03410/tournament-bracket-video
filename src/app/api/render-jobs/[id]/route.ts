import { NextResponse } from "next/server";
import { userOr401, notFound, badRequest } from "@/lib/api";
import { prisma } from "@/lib/db";
import { deleteRenderJob } from "@/server/users";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const job = await prisma.renderJob.findFirst({
    where: {
      id: params.id,
      OR: [{ tournament: { userId: auth.userId } }, { project: { userId: auth.userId } }],
    },
  });
  if (!job) return notFound();

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    downloadUrl: job.outputPath ? `/api/render-jobs/${job.id}/download` : null,
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  try {
    await deleteRenderJob(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "JOB_ACTIVE") return badRequest("Дождитесь завершения рендера");
    throw e;
  }
}

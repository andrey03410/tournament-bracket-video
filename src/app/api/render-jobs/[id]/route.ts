import { NextResponse } from "next/server";
import { userOr401, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const job = await prisma.renderJob.findFirst({
    where: { id: params.id, tournament: { userId: auth.userId } },
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

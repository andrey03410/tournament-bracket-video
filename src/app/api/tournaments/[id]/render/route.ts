import { NextResponse } from "next/server";
import { userOr401, permissionOr403, badRequest } from "@/lib/api";
import { prisma } from "@/lib/db";
import { startRenderJob } from "@/server/render";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const jobs = await prisma.renderJob.findMany({
    where: { tournamentId: params.id, tournament: { userId: auth.userId } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      progress: j.progress,
      error: j.error,
      hasOutput: Boolean(j.outputPath),
      createdAt: j.createdAt,
    })),
  });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await permissionOr403(
    "render:run",
    "Рендер доступен только администратору",
  );
  if ("response" in auth) return auth.response;
  try {
    const jobId = await startRenderJob(auth.userId, params.id);
    return NextResponse.json({ jobId });
  } catch (e) {
    return badRequest(String((e as Error).message));
  }
}

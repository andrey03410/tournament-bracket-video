import { NextResponse } from "next/server";
import { userOr401, permissionOr403, badRequest, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { startProjectRenderJob } from "@/server/render";
import { startPickerRenderJob } from "@/server/picker-render";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const jobs = await prisma.renderJob.findMany({
    where: { projectId: params.id, project: { userId: auth.userId } },
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

  const project = await prisma.videoProject.findFirst({
    where: { id: params.id, userId: auth.userId },
  });
  if (!project) return notFound();

  try {
    const jobId =
      project.kind === "picker"
        ? await startPickerRenderJob(auth.userId, params.id)
        : await startProjectRenderJob(auth.userId, params.id);
    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "EMPTY_PROJECT") return badRequest("Добавьте хотя бы один раунд с блоками");
    if (msg === "ROUND_TOO_SMALL") return badRequest("В каждом раунде должно быть минимум 2 блока");
    if (msg === "EMPTY_TOP") return badRequest("Добавьте хотя бы одну позицию");
    return badRequest(msg);
  }
}

import { NextResponse } from "next/server";
import { userOr401, permissionOr403, badRequest, serverError } from "@/lib/api";
import { createProject, listProjects } from "@/server/projects";

export async function GET() {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const projects = await listProjects(auth.userId);
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      roundCount: p._count.rounds,
      itemCount: p.renderConfig?._count.items ?? 0,
      renderCount: p._count.renderJobs,
      updatedAt: p.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  // Projects reuse the tournament-creation permission: they are the same
  // "author content" capability, just without an archive.
  const auth = await permissionOr403(
    "tournament:create",
    "Создание видео недоступно вашей роли",
  );
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  try {
    const project = await createProject(
      auth.userId,
      String(body.title ?? ""),
      String(body.kind ?? ""),
    );
    return NextResponse.json({ id: project.id, kind: project.kind });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "BAD_KIND") return badRequest("Неизвестный режим видео");
    if (msg === "NO_TITLE") return badRequest("Укажите название");
    return serverError(e);
  }
}

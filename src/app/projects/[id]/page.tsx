import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/auth";
import { can } from "@/lib/domain/permissions";
import { getProject } from "@/server/projects";
import { RenderConstructor } from "@/app/tournaments/[id]/render/RenderConstructor";
import { PickerConstructor } from "./PickerConstructor";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/");

  const project = await getProject(user.id, params.id);
  if (!project) notFound();
  const canRender = can(user.role, "render:run");

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>
          {project.kind === "picker" ? "Конструктор пикера" : "Ручной топ"} — {project.title}
        </h1>
        <a href="/projects" className="muted">← к списку видео</a>
      </div>
      {project.kind === "picker" ? (
        <PickerConstructor projectId={project.id} canRender={canRender} />
      ) : (
        <RenderConstructor
          baseUrl={`/api/projects/${project.id}`}
          manualProjectId={project.id}
          canRender={canRender}
        />
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { listProjects } from "@/server/projects";
import { CreateProjectForm } from "./CreateProjectForm";
import { DeleteProjectButton } from "./DeleteProjectButton";

const KIND_LABEL: Record<string, string> = {
  top: "Ручной топ",
  picker: "Выбор (пикер)",
};

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  const projects = await listProjects(user.id);

  return (
    <div className="container">
      <h1>Мои видео</h1>
      <CreateProjectForm />

      <div className="panel">
        <h2>Список проектов</h2>
        {projects.length === 0 ? (
          <p className="muted">
            Пока нет ни одного видео-проекта. Создайте первый выше — или соберите
            топ через <a href="/tournaments">турнир сравнений</a>.
          </p>
        ) : (
          projects.map((p) => (
            <div className="list-item" key={p.id}>
              <div>
                <a href={`/projects/${p.id}`} style={{ fontWeight: 600, fontSize: 16 }}>
                  {p.title}
                </a>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {KIND_LABEL[p.kind] ?? p.kind} ·{" "}
                  {p.kind === "picker"
                    ? `${p._count.rounds} раундов`
                    : `${p.renderConfig?._count.items ?? 0} позиций`}
                  {p._count.renderJobs > 0 ? ` · ${p._count.renderJobs} рендеров` : ""}
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="tag">{KIND_LABEL[p.kind] ?? p.kind}</span>
                <DeleteProjectButton id={p.id} title={p.title} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

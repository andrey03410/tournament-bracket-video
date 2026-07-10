import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/auth";
import { can } from "@/lib/domain/permissions";
import { getTournament } from "@/server/tournaments";
import { RenderConstructor } from "./RenderConstructor";

export default async function RenderPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/");

  const t = await getTournament(user.id, params.id);
  if (!t) notFound();
  if (t.status !== "completed") redirect(`/tournaments/${params.id}`);

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Конструктор видео — {t.title}</h1>
        <a href={`/tournaments/${params.id}`} className="muted">← к турниру</a>
      </div>
      <RenderConstructor
        tournamentId={params.id}
        canRender={can(user.role, "render:run")}
      />
    </div>
  );
}

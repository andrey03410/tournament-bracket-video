import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getTournament } from "@/server/tournaments";
import { RenderConstructor } from "./RenderConstructor";

export default async function RenderPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTournament(session.user.id, params.id);
  if (!t) notFound();
  if (t.status !== "completed") redirect(`/tournaments/${params.id}`);

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Конструктор видео — {t.title}</h1>
        <a href={`/tournaments/${params.id}`} className="muted">← к турниру</a>
      </div>
      <RenderConstructor tournamentId={params.id} />
    </div>
  );
}

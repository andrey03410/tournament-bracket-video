import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listTournaments } from "@/server/tournaments";
import { CreateTournamentForm } from "./CreateTournamentForm";
import { DeleteTournamentButton } from "./DeleteTournamentButton";

const SCHEME_LABEL: Record<string, string> = {
  merge: "Сравнительная сортировка",
  swiss: "Швейцарка",
  round_robin: "Круговая",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  in_progress: "В процессе",
  completed: "Завершён",
};

export default async function TournamentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const tournaments = await listTournaments(session.user.id);

  return (
    <div className="container">
      <h1>Мои топы</h1>
      <CreateTournamentForm />

      <div className="panel">
        <h2>Список турниров</h2>
        {tournaments.length === 0 ? (
          <p className="muted">Пока нет ни одного турнира. Создайте первый выше.</p>
        ) : (
          tournaments.map((t) => (
            <div className="list-item" key={t.id}>
              <div>
                <a href={`/tournaments/${t.id}`} style={{ fontWeight: 600, fontSize: 16 }}>
                  {t.title}
                </a>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {SCHEME_LABEL[t.scheme] ?? t.scheme} · {t._count.tracks} OST ·{" "}
                  {t._count.comparisons} сравнений
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="tag">{STATUS_LABEL[t.status] ?? t.status}</span>
                <DeleteTournamentButton id={t.id} title={t.title} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

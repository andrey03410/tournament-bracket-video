"use client";

import { useCallback, useEffect, useState } from "react";

interface TournamentRow {
  id: string;
  title: string;
  status: string;
  trackCount: number;
  sizeBytes: number;
  createdAt: string;
}
interface ArtRowDto {
  id: string;
  label: string | null;
  kind: string;
  sizeBytes: number;
  usageCount: number;
  createdAt: string;
}
interface RenderRow {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  status: string;
  sizeBytes: number;
  hasOutput: boolean;
  createdAt: string;
}
interface UsageDto {
  email: string;
  role: string;
  quotas: {
    maxTournaments: number | null;
    maxArchiveBytes: number;
    maxPoolBytes: number | null;
  };
  tournaments: TournamentRow[];
  arts: ArtRowDto[];
  renders: RenderRow[];
  archiveBytes: number;
  poolBytes: number;
  renderBytes: number;
}

const MB = 1024 * 1024;
function fmtBytes(n: number): string {
  if (n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(1)} ГБ`;
  if (n >= MB) return `${(n / MB).toFixed(1)} МБ`;
  if (n >= 1024) return `${Math.round(n / 1024)} КБ`;
  return `${Math.round(n)} Б`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  in_progress: "В процессе",
  completed: "Завершён",
  queued: "В очереди",
  running: "Рендерится",
  done: "Готов",
  failed: "Ошибка",
};

function QuotaLine({ used, max, label }: { used: number; max: number | null; label: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
        <span>{label}</span>
        <span className="muted">
          {fmtBytes(used)}
          {max !== null ? ` из ${fmtBytes(max)}` : " (без лимита)"}
        </span>
      </div>
      {max !== null ? (
        <div className="progressbar" style={{ marginTop: 4 }}>
          <div style={{ width: `${Math.min(100, Math.round((used / max) * 100))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function AccountManager() {
  const [data, setData] = useState<UsageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/account/usage", { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Не удалось загрузить данные");
      return;
    }
    setData(d);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function remove(kind: "tournament" | "art" | "render", id: string, title: string) {
    const what =
      kind === "tournament"
        ? `архив «${title}» со всеми треками, сравнениями и рендерами`
        : kind === "art"
          ? `медиа «${title}» из пула`
          : `рендер «${title}»`;
    if (!confirm(`Удалить ${what}? Файлы будут стёрты с сервера.`)) return;
    setBusyId(id);
    setError(null);
    try {
      const url =
        kind === "tournament"
          ? `/api/tournaments/${id}`
          : kind === "art"
            ? `/api/arts/${id}`
            : `/api/render-jobs/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Не удалось удалить");
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!data) {
    return <div className="panel">{error ? <div className="error">{error}</div> : "Загрузка…"}</div>;
  }

  return (
    <>
      <div className="panel">
        <h2>Профиль</h2>
        <p className="muted" style={{ margin: 0 }}>
          {data.email}
        </p>
        <QuotaLine used={data.archiveBytes} max={data.quotas.maxArchiveBytes} label="Архивы (треки турниров)" />
        <QuotaLine used={data.poolBytes} max={data.quotas.maxPoolBytes} label="Пул медиа" />
        {data.quotas.maxTournaments !== null ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Одновременно можно держать {data.quotas.maxTournaments} загруженный
            архив: занято {data.tournaments.length} из {data.quotas.maxTournaments}.
          </p>
        ) : null}
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="panel">
        <h2>Архивы ({data.tournaments.length})</h2>
        {data.tournaments.length === 0 ? (
          <p className="muted">Нет загруженных архивов.</p>
        ) : (
          data.tournaments.map((t) => (
            <div className="list-item" key={t.id}>
              <div>
                <a href={`/tournaments/${t.id}`} style={{ fontWeight: 600 }}>
                  {t.title}
                </a>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {t.trackCount} треков · {fmtBytes(t.sizeBytes)} ·{" "}
                  {STATUS_LABEL[t.status] ?? t.status}
                </div>
              </div>
              <button
                className="btn ghost"
                disabled={busyId === t.id}
                onClick={() => remove("tournament", t.id, t.title)}
              >
                Удалить
              </button>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h2>Пул медиа ({data.arts.length})</h2>
        {data.arts.length === 0 ? (
          <p className="muted">Пул пуст.</p>
        ) : (
          data.arts.map((a) => (
            <div className="list-item" key={a.id}>
              <div>
                <span style={{ fontWeight: 600 }}>
                  {a.kind === "video" ? "🎬 " : "🖼 "}
                  {a.label ?? "Без названия"}
                </span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {fmtBytes(a.sizeBytes)}
                  {a.usageCount > 0 ? ` · используется в ${a.usageCount} позициях` : ""}
                </div>
              </div>
              <button
                className="btn ghost"
                disabled={busyId === a.id}
                onClick={() => remove("art", a.id, a.label ?? "без названия")}
              >
                Удалить
              </button>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h2>Рендеры ({data.renders.length})</h2>
        {data.renders.length === 0 ? (
          <p className="muted">Готовых рендеров нет.</p>
        ) : (
          data.renders.map((r) => (
            <div className="list-item" key={r.id}>
              <div>
                <span style={{ fontWeight: 600 }}>{r.tournamentTitle}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                  {r.hasOutput ? ` · ${fmtBytes(r.sizeBytes)}` : ""}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {r.hasOutput ? (
                  <a className="btn ghost" href={`/api/render-jobs/${r.id}/download`}>
                    ⬇ Скачать
                  </a>
                ) : null}
                <button
                  className="btn ghost"
                  disabled={busyId === r.id}
                  onClick={() => remove("render", r.id, r.tournamentTitle)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

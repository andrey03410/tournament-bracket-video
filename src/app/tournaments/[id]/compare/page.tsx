"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface TrackDto {
  id: string;
  title: string;
  artist: string | null;
  kind: "audio" | "video";
  audioUrl: string;
}
interface Standing {
  trackId: string;
  rank: number;
  title: string;
  artist: string | null;
  score: number;
}
interface NextResponse {
  blindMode: boolean;
  isComplete: boolean;
  progress: { completed: number; estimatedTotal: number };
  standings: Standing[] | null;
  pair: { a: TrackDto; b: TrackDto } | null;
}

export default function ComparePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<NextResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/tournaments/${params.id}/next`, { cache: "no-store" });
    if (!res.ok) {
      setError("Не удалось загрузить сравнение");
      return;
    }
    const json: NextResponse = await res.json();
    if (json.isComplete) {
      router.push(`/tournaments/${params.id}`);
      return;
    }
    setReveal(false);
    setData(json);
  }, [params.id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(result: "a" | "b" | "draw") {
    if (!data?.pair || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tournaments/${params.id}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: data.pair.a.id, b: data.pair.b.id, result }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      if (json.isComplete) {
        router.push(`/tournaments/${params.id}`);
        return;
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="container">
        <div className="panel">
          <div className="error">{error}</div>
          <button className="btn secondary" onClick={() => load()} style={{ marginTop: 12 }}>
            Повторить
          </button>
        </div>
      </div>
    );
  }
  if (!data?.pair) {
    return (
      <div className="container">
        <p className="muted">Загрузка…</p>
      </div>
    );
  }

  const { a, b } = data.pair;
  const pct = data.progress.estimatedTotal
    ? Math.min(100, Math.round((data.progress.completed / data.progress.estimatedTotal) * 100))
    : 0;
  const showNames = !data.blindMode || reveal;

  const name = (t: TrackDto) =>
    showNames ? (
      <>
        {t.title}
        {t.artist ? <div className="muted" style={{ fontSize: 13 }}>{t.artist}</div> : null}
      </>
    ) : (
      "🎧"
    );

  // Starting one player pauses the other — a video+audio cacophony helps nobody.
  const pauseOthers = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const self = e.currentTarget;
    document
      .querySelectorAll<HTMLMediaElement>(".versus audio, .versus video")
      .forEach((m) => {
        if (m !== self) m.pause();
      });
  };

  // Blind mode hides the footage too (it gives the track away): play the file
  // through an <audio> element until names are revealed.
  const player = (t: TrackDto) =>
    t.kind === "video" && showNames ? (
      <video
        controls
        preload="metadata"
        src={t.audioUrl}
        onPlay={pauseOthers}
        style={{ width: "100%", maxHeight: 240, background: "#000", borderRadius: 8 }}
      />
    ) : (
      <audio controls preload="none" src={t.audioUrl} onPlay={pauseOthers} />
    );

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Что лучше?</h1>
        <a href={`/tournaments/${params.id}`} className="muted">Выйти (прогресс сохранён)</a>
      </div>

      <div className="progressbar" style={{ margin: "16px 0 24px" }}>
        <div style={{ width: `${pct}%` }} />
      </div>

      <div className="versus">
        <div className="choice">
          <div className="name">{name(a)}</div>
          {player(a)}
          <button className="btn" style={{ marginTop: 16 }} onClick={() => submit("a")} disabled={busy}>
            ← Это лучше
          </button>
        </div>
        <div className="vs">VS</div>
        <div className="choice">
          <div className="name">{name(b)}</div>
          {player(b)}
          <button className="btn" style={{ marginTop: 16 }} onClick={() => submit("b")} disabled={busy}>
            Это лучше →
          </button>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "center", marginTop: 22, gap: 14 }}>
        <button className="btn secondary" onClick={() => submit("draw")} disabled={busy}>
          Ничья
        </button>
        {data.blindMode ? (
          <button className="btn ghost" onClick={() => setReveal((r) => !r)}>
            {reveal ? "Скрыть названия" : "Показать названия"}
          </button>
        ) : null}
        {data.standings ? (
          <button className="btn ghost" onClick={() => setShowTop((s) => !s)}>
            {showTop ? "Скрыть текущий топ" : "Показать текущий топ"}
          </button>
        ) : null}
      </div>

      {showTop && data.standings ? (
        <div className="panel" style={{ marginTop: 22 }}>
          <h2>Предварительный топ</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
            Промежуточные позиции по текущим очкам — будут меняться по ходу сравнений.
          </p>
          {data.standings.map((s) => (
            <div className="rank-row" key={s.trackId}>
              <div className="rank-num">{s.rank}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                {s.artist ? (
                  <div className="muted" style={{ fontSize: 13 }}>{s.artist}</div>
                ) : null}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{s.score} очк.</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

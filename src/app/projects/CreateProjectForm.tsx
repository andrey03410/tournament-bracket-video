"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateProjectForm() {
  const router = useRouter();
  const [kind, setKind] = useState<"picker" | "top">("picker");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.get("title"), kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      router.push(`/projects/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Новое видео</h2>
      <label>Название</label>
      <input name="title" placeholder="Выбери опенинг · выпуск 1" required />

      <label>Режим</label>
      <div className="mode-cards">
        <button
          type="button"
          className={`mode-card${kind === "picker" ? " active" : ""}`}
          onClick={() => setKind("picker")}
        >
          <div style={{ fontSize: 26 }}>🎛</div>
          <b>Выбор (пикер)</b>
          <span className="muted">
            «Выбери персонажа / OST / опенинг»: раунды с правилом сверху, 2–9
            блоков с анимацией и таймером выбора в конце.
          </span>
        </button>
        <button
          type="button"
          className={`mode-card${kind === "top" ? " active" : ""}`}
          onClick={() => setKind("top")}
        >
          <div style={{ fontSize: 26 }}>🏆</div>
          <b>Ручной топ</b>
          <span className="muted">
            Видео-«топ» без турнира: соберите позиции сами из пула медиа (аудио
            или видео со звуком), порядок задаёте вы.
          </span>
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>
        {busy ? "Создание…" : "Создать"}
      </button>
    </form>
  );
}

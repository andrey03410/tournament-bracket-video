"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateTournamentForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      router.push(`/tournaments/${data.id}/compare`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Новый топ</h2>
      <label>Название</label>
      <input name="title" placeholder="Лучшие OST 2024" required />

      <label>Схема турнира</label>
      <select name="scheme" defaultValue="merge">
        <option value="merge">Сравнительная сортировка (минимум сравнений)</option>
        <option value="swiss">Швейцарка (быстрее, приблизительно)</option>
        <option value="round_robin">Круговая (все пары, точнее всего)</option>
      </select>

      <label className="row" style={{ gap: 8, marginTop: 14 }}>
        <input type="checkbox" name="blindMode" />
        <span>Слепой режим (скрывать названия во время сравнения)</span>
      </label>

      <label>ZIP-архив с OST</label>
      <input name="file" type="file" accept=".zip,application/zip" required />

      {error ? <div className="error">{error}</div> : null}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 18 }}>
        {busy ? "Загрузка…" : "Создать и начать"}
      </button>
    </form>
  );
}

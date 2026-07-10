"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CreateFormLimits {
  /** Human-readable archive size cap, e.g. "100 МБ". */
  archiveLimitLabel: string;
  /** null = unlimited; otherwise remaining tournament slots. */
  slotsLeft: number | null;
}

export function CreateTournamentForm({ limits }: { limits: CreateFormLimits }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slotFull = limits.slotsLeft !== null && limits.slotsLeft <= 0;

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

  if (slotFull) {
    return (
      <div className="panel">
        <h2>Новый топ</h2>
        <p className="muted">
          Достигнут лимит архивов для вашей роли. Удалите существующий в{" "}
          <a href="/account">личном кабинете</a>, чтобы загрузить новый.
        </p>
      </div>
    );
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
        <span>Слепой режим (скрывать названия — и видеоряд — во время сравнения)</span>
      </label>

      <label>ZIP-архив с треками (аудио и/или видео)</label>
      <input name="file" type="file" accept=".zip,application/zip" required />

      <details className="hint-details">
        <summary>Как подготовить архив</summary>
        <ul>
          <li>
            Один ZIP-архив, внутри — файлы треков (можно во вложенных папках).
            Минимум 2 файла, лимит архива — {limits.archiveLimitLabel}
            {limits.slotsLeft !== null
              ? "; одновременно можно держать один загруженный архив"
              : ""}
            .
          </li>
          <li>
            <b>Аудио:</b> mp3, m4a, aac, flac, wav, ogg, opus. Название и
            исполнитель берутся из тегов (ID3), иначе — из имени файла.
          </li>
          <li>
            <b>Видео:</b> mp4, webm, mov. Рекомендуем MP4 (H.264 + AAC) — он
            гарантированно играет в браузере и в рендере. Название — из имени
            файла. Видео без звука тоже допустимо.
          </li>
          <li>
            Аудио и видео можно смешивать в одном архиве — такие треки будут
            сравниваться друг с другом наравне.
          </li>
          <li>
            В слепом режиме видеоряд скрывается: видео-трек играет как аудио,
            пока не нажмёте «Показать названия».
          </li>
          <li>
            Громкость не нормализуется: если звук видео заметно тише/громче
            музыки, это будет слышно и в сравнении, и в рендере.
          </li>
        </ul>
      </details>

      {error ? <div className="error">{error}</div> : null}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 18 }}>
        {busy ? "Загрузка…" : "Создать и начать"}
      </button>
    </form>
  );
}

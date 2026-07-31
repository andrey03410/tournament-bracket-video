"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { describeUsage, pluralRu } from "@/lib/domain/art-usage";
import { RenameField } from "@/app/components/RenameField";
import type { MediaPool, PoolArt, PoolKind } from "@/app/components/useMediaPool";

// One view over the pool in two shapes: the manager's grid of thumbnails and the
// cabinet's compact rows. Both get the same search, filter, rename, selection and
// delete, because both are the same pool (phase 17).

const MB = 1024 * 1024;
export function fmtBytes(n: number | null): string {
  if (n == null) return "";
  if (n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(1)} ГБ`;
  if (n >= MB) return `${(n / MB).toFixed(1)} МБ`;
  if (n >= 1024) return `${Math.round(n / 1024)} КБ`;
  return `${Math.round(n)} Б`;
}

export function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const KIND_TABS: [("" | PoolKind), string][] = [
  ["", "Все"],
  ["image", "Картинки"],
  ["video", "Видео"],
  ["audio", "Аудио"],
];

/** Thumbnail of a pool media: poster frame for video, note for audio. */
export function MediaThumb({ art, className = "thumb" }: { art: PoolArt; className?: string }) {
  if (art.kind === "audio") return <div className={`${className} audio-thumb`}>🎵</div>;
  if (art.kind === "video" && !art.posterUrl)
    return <video className={className} src={art.url} muted preload="metadata" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={art.kind === "video" ? art.posterUrl! : art.url}
      alt={art.label ?? "медиа"}
      loading="lazy"
    />
  );
}

export function MediaBrowser({
  pool,
  view = "grid",
  manage = true,
  onPick,
  pickKinds,
  header,
  emptyText = "Пул пуст — загрузите первые картинки или видео.",
}: {
  pool: MediaPool;
  view?: "grid" | "rows";
  /** Rename, select and delete controls (off in the picking modal). */
  manage?: boolean;
  /** Clicking a card picks it instead of doing nothing. */
  onPick?: (art: PoolArt) => void;
  /** Kinds selectable in picking mode; others are hidden. */
  pickKinds?: PoolKind[];
  /** Extra block above the list (e.g. the "recent" strip). */
  header?: ReactNode;
  emptyText?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll: the sentinel below the list asks for the next page.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void pool.loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [pool.loadMore, pool]);

  const visible = pickKinds ? pool.arts.filter((a) => pickKinds.includes(a.kind)) : pool.arts;

  function controls(art: PoolArt, index: number) {
    if (!manage) return null;
    return (
      <>
        <input
          type="checkbox"
          className="pick"
          title="Выбрать (Shift — диапазон)"
          checked={pool.selected.has(art.id)}
          readOnly
          onClick={(e) => {
            e.stopPropagation();
            pool.toggleSelected(index, art.id, e.shiftKey);
          }}
        />
        <button
          className="del"
          title="Удалить"
          onClick={(e) => {
            e.stopPropagation();
            void pool.remove(art);
          }}
        >
          ✕
        </button>
      </>
    );
  }

  function gridCard(art: PoolArt, index: number) {
    return (
      <div
        key={art.id}
        className={`art-card${onPick ? " selectable" : ""}${
          pool.selected.has(art.id) ? " picked" : ""
        }`}
        onClick={onPick ? () => onPick(art) : undefined}
      >
        <MediaThumb art={art} />
        {art.kind === "video" ? (
          <span className="art-badge">
            🎬 {fmtDuration(art.durationSec)}
            {art.hasAudio ? "" : " · без звука"}
          </span>
        ) : art.kind === "audio" ? (
          <span className="art-badge">🎵 {fmtDuration(art.durationSec)}</span>
        ) : null}
        {manage ? (
          <>
            {controls(art, index)}
            <div className="meta">
              <RenameField value={art.label} onSave={(next) => pool.rename(art, next)} />
              <span className="art-usage" title={describeUsage(art.usage)}>
                {describeUsage(art.usage)}
              </span>
            </div>
          </>
        ) : (
          <div className="meta">{art.label ?? "без названия"}</div>
        )}
      </div>
    );
  }

  function row(art: PoolArt, index: number) {
    return (
      <div
        key={art.id}
        className={`media-row${pool.selected.has(art.id) ? " picked" : ""}`}
        onClick={onPick ? () => onPick(art) : undefined}
      >
        {manage ? (
          <input
            type="checkbox"
            className="row-pick"
            title="Выбрать (Shift — диапазон)"
            checked={pool.selected.has(art.id)}
            readOnly
            onClick={(e) => {
              e.stopPropagation();
              pool.toggleSelected(index, art.id, e.shiftKey);
            }}
          />
        ) : null}
        <MediaThumb art={art} className="row-thumb" />
        <span className="row-main">
          {manage ? (
            <RenameField value={art.label} onSave={(next) => pool.rename(art, next)} />
          ) : (
            <span>{art.label ?? "без названия"}</span>
          )}
          <span className="muted row-facts">
            {fmtBytes(art.sizeBytes)}
            {art.durationSec != null ? ` · ${fmtDuration(art.durationSec)}` : ""} ·{" "}
            {describeUsage(art.usage)}
          </span>
        </span>
        {manage ? (
          <button className="btn ghost" onClick={() => void pool.remove(art)}>
            Удалить
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <input
          placeholder="🔍 Поиск по названию…"
          value={pool.query}
          onChange={(e) => pool.setQuery(e.target.value)}
          style={{ flex: 1, marginBottom: 0 }}
        />
        <div className="kind-tabs">
          {KIND_TABS.filter(([value]) => !pickKinds || value === "" || pickKinds.includes(value as PoolKind)).map(
            ([value, label]) => (
              <button
                key={value}
                className={`btn ghost${pool.kind === value ? " active" : ""}`}
                onClick={() => pool.setKind(value)}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      {manage && pool.selected.size > 0 ? (
        <div className="select-bar">
          <span>
            Выбрано {pool.selected.size} {pluralRu(pool.selected.size, ["файл", "файла", "файлов"])}
          </span>
          <button className="btn secondary" onClick={() => void pool.removeSelected()}>
            Удалить выбранные
          </button>
          <button className="btn ghost" onClick={pool.clearSelection}>
            Снять выделение
          </button>
        </div>
      ) : null}
      {pool.error ? <div className="error" style={{ marginBottom: 10 }}>{pool.error}</div> : null}

      {header}

      {visible.length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>
          {pool.query || pool.kind ? "Ничего не найдено." : emptyText}
        </p>
      ) : view === "grid" ? (
        <div className="art-grid">{visible.map((a, i) => gridCard(a, i))}</div>
      ) : (
        <div className="media-rows">{visible.map((a, i) => row(a, i))}</div>
      )}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </>
  );
}

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import type { ArtCrop } from "@/lib/domain/art-crop";

export type GalleryKind = "image" | "video" | "audio";

export interface GalleryArt {
  id: string;
  url: string;
  label: string | null;
  kind: GalleryKind;
  posterUrl: string | null;
  durationSec: number | null;
  hasAudio: boolean;
  usageCount: number;
}

export interface PickResult {
  artId: string;
  crop: ArtCrop | null;
}

const PAGE_SIZE = 40;

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function fetchArts(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/arts?${qs}`, { cache: "no-store" });
  if (!res.ok) return { arts: [] as GalleryArt[], nextCursor: null };
  return (await res.json()) as { arts: GalleryArt[]; nextCursor: string | null };
}

/** 16:9 crop editor over one media (image or video). Reports a normalized rect (0..1). */
function CropStep({
  artUrl,
  mediaKind,
  initialCrop,
  onApply,
  onBack,
}: {
  artUrl: string;
  mediaKind: GalleryKind;
  initialCrop: ArtCrop | null;
  onApply: (crop: ArtCrop | null) => void;
  onBack: (() => void) | null;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const areaRef = useRef<Area | null>(null);

  return (
    <>
      <div className="cropper-box">
        <Cropper
          {...(mediaKind === "video" ? { video: artUrl } : { image: artUrl })}
          crop={crop}
          zoom={zoom}
          maxZoom={8}
          aspect={16 / 9}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(areaPercent) => {
            areaRef.current = areaPercent;
          }}
          initialCroppedAreaPercentages={
            initialCrop
              ? {
                  x: initialCrop.x * 100,
                  y: initialCrop.y * 100,
                  width: initialCrop.w * 100,
                  height: initialCrop.h * 100,
                }
              : undefined
          }
        />
      </div>
      <div className="row" style={{ marginTop: 12, gap: 10, alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 13 }}>Зум</span>
        <input
          type="range"
          min={1}
          max={8}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ flex: 1, padding: 0 }}
        />
      </div>
      <div className="row" style={{ marginTop: 14, gap: 10 }}>
        <button
          className="btn"
          onClick={() => {
            const a = areaRef.current;
            if (!a) return onApply(null);
            const clamp = (v: number) => Math.min(1, Math.max(0, v / 100));
            onApply({ x: clamp(a.x), y: clamp(a.y), w: clamp(a.width), h: clamp(a.height) });
          }}
        >
          Применить
        </button>
        <button className="btn secondary" onClick={() => onApply(null)}>
          Без обрезки
        </button>
        {onBack ? (
          <button className="btn ghost" onClick={onBack}>
            ← Назад
          </button>
        ) : null}
      </div>
    </>
  );
}

interface DownloadJobDto {
  id: string;
  url: string;
  mode: "video" | "audio";
  quality: number;
  title: string | null;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  progress: number;
  error: string | null;
  artId: string | null;
}

/**
 * Paste-a-link import: URL field + mode/quality + background download list.
 * Downloads keep running server-side when the modal (or the tab) is closed.
 */
function UrlImportPanel({ onPoolChange }: { onPoolChange: () => void }) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"1080" | "720" | "480" | "audio">("1080");
  const [jobs, setJobs] = useState<DownloadJobDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const doneIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/downloads", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const list: DownloadJobDto[] = data.jobs;
    setJobs(list);
    // a job finishing while we watch -> refresh the pool grid
    for (const j of list) {
      if (j.status === "done" && !doneIdsRef.current.has(j.id)) {
        doneIdsRef.current.add(j.id);
        onPoolChange();
      }
    }
    return list;
  }, [onPoolChange]);

  useEffect(() => {
    void refresh().then((list) => {
      for (const j of list ?? []) if (j.status === "done") doneIdsRef.current.add(j.id);
    });
    timerRef.current = setInterval(() => void refresh(), 1500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  async function start() {
    setError(null);
    if (!url.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          mode: mode === "audio" ? "audio" : "video",
          quality: mode === "audio" ? undefined : Number(mode),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось начать загрузку");
      setUrl("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(job: DownloadJobDto) {
    await fetch(`/api/downloads/${job.id}`, { method: "DELETE" });
    await refresh();
  }

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const finished = jobs.filter((j) => j.status !== "queued" && j.status !== "running");

  return (
    <div className="url-import">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <input
          placeholder="🔗 Ссылка на видео (YouTube и другие сайты)…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void start()}
          style={{ flex: 1, marginBottom: 0 }}
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          style={{ width: 170, marginBottom: 0 }}
        >
          <option value="1080">Видео до 1080p</option>
          <option value="720">Видео до 720p</option>
          <option value="480">Видео до 480p</option>
          <option value="audio">Только звук (m4a)</option>
        </select>
        <button className="btn secondary" disabled={busy || !url.trim()} onClick={() => void start()}>
          ⬇ Скачать
        </button>
      </div>
      {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}

      {active.length + finished.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          {[...active, ...finished.slice(0, 4)].map((j) => (
            <div className="row" key={j.id} style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                {j.mode === "audio" ? "🎵" : "🎬"} {j.title ?? j.url}
              </span>
              {j.status === "running" || j.status === "queued" ? (
                <>
                  <div className="progressbar" style={{ width: 140, margin: 0 }}>
                    <div style={{ width: `${Math.round(j.progress * 100)}%` }} />
                  </div>
                  <span className="muted" style={{ fontSize: 12, width: 38 }}>
                    {Math.round(j.progress * 100)}%
                  </span>
                </>
              ) : j.status === "done" ? (
                <span style={{ fontSize: 12, color: "#7be29a" }}>готово — в пуле</span>
              ) : j.status === "canceled" ? (
                <span className="muted" style={{ fontSize: 12 }}>отменено</span>
              ) : (
                <span className="error-text" style={{ fontSize: 12, maxWidth: 280 }} title={j.error ?? ""}>
                  {j.error ?? "ошибка"}
                </span>
              )}
              <button className="btn ghost" title={j.status === "running" || j.status === "queued" ? "Отменить" : "Убрать из списка"} onClick={() => void cancel(j)}>
                ✕
              </button>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
            Загрузка идёт на сервере — окно можно закрыть, файл появится в пуле.
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface ShkResult {
  id: number;
  type: "anime" | "character";
  label: string | null;
  thumbUrl: string | null;
  posterPath: string | null;
  facts: string | null;
}

/** Search Shikimori (anime/character) and import a poster into the pool. */
function ShikimoriPanel({ onPoolChange }: { onPoolChange: () => void }) {
  const [type, setType] = useState<"anime" | "character">("anime");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ShkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);

  useEffect(() => {
    setError(null);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/shikimori/search?type=${type}&q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
        setResults(data.results as ShkResult[]);
      } catch (e) {
        setError((e as Error).message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, type]);

  async function importOne(r: ShkResult) {
    if (!r.posterPath) return;
    setImportingId(r.id);
    setError(null);
    try {
      const res = await fetch("/api/shikimori/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: r.type, id: r.id, posterPath: r.posterPath, label: r.label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось импортировать");
      setDoneId(r.id);
      onPoolChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="shikimori-panel">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <div className="kind-tabs">
          <button className={`btn ghost${type === "anime" ? " active" : ""}`} onClick={() => setType("anime")}>
            Аниме
          </button>
          <button className={`btn ghost${type === "character" ? " active" : ""}`} onClick={() => setType("character")}>
            Персонажи
          </button>
        </div>
        <input
          placeholder="🎴 Поиск в Shikimori…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, marginBottom: 0 }}
        />
      </div>
      {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}
      {loading ? <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Ищем…</p> : null}
      {results.length > 0 ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {results.map((r) => (
            <div className="shk-result row" key={`${r.type}-${r.id}`} style={{ gap: 8, alignItems: "center" }}>
              {r.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbUrl} alt={r.label ?? ""} className="shk-thumb" loading="lazy" />
              ) : (
                <div className="shk-thumb shk-thumb-empty">🎴</div>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.label ?? "без названия"}
                </span>
                {r.facts ? <span className="muted" style={{ fontSize: 12 }}>{r.facts}</span> : null}
              </span>
              {doneId === r.id ? (
                <span style={{ fontSize: 12, color: "#7be29a" }}>в пуле</span>
              ) : (
                <button
                  className="btn secondary"
                  disabled={importingId === r.id || !r.posterPath}
                  onClick={() => void importOne(r)}
                >
                  {importingId === r.id ? "…" : "⬇ В пул"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Art gallery modal. mode="manage": upload (multi + drag&drop), rename, delete.
 * mode="pick": search + recent + infinite grid, click -> crop step -> onPick.
 * mode="crop": crop step only, for re-editing an already assigned art.
 */
export function ArtGalleryModal({
  mode,
  cropTarget,
  onPick,
  onClose,
  onPoolChange,
  pickKinds = ["image", "video"],
}: {
  mode: "manage" | "pick" | "crop";
  /** For mode="crop": the media being re-cropped and its current crop. */
  cropTarget?: { artUrl: string; kind: GalleryKind; crop: ArtCrop | null };
  onPick?: (res: PickResult) => void;
  onClose: () => void;
  /** Called after uploads/deletes so the parent can refresh its own art usages. */
  onPoolChange?: () => void;
  /** Which pool kinds are selectable in mode="pick" (others are hidden). */
  pickKinds?: GalleryKind[];
}) {
  const [arts, setArts] = useState<GalleryArt[]>([]);
  const [recent, setRecent] = useState<GalleryArt[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | GalleryKind>("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [cropArt, setCropArt] = useState<{
    artId: string | null;
    artUrl: string;
    kind: GalleryKind;
    crop: ArtCrop | null;
  } | null>(
    mode === "crop" && cropTarget
      ? { artId: null, artUrl: cropTarget.artUrl, kind: cropTarget.kind, crop: cropTarget.crop }
      : null,
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadingRef = useRef(false);

  const loadFirstPage = useCallback(async (q: string, kind: "" | GalleryKind) => {
    const data = await fetchArts({
      limit: String(PAGE_SIZE),
      ...(q ? { q } : {}),
      ...(kind ? { kind } : {}),
    });
    setArts(data.arts);
    setNextCursor(data.nextCursor);
  }, []);

  // Initial load + recent block (picker only).
  useEffect(() => {
    if (mode === "crop") return;
    void loadFirstPage("", "");
    if (mode === "pick") {
      void fetchArts({ recent: "1" }).then((d) => setRecent(d.arts));
    }
  }, [mode, loadFirstPage]);

  // Debounced search (also re-runs on the kind filter change).
  useEffect(() => {
    if (mode === "crop") return;
    const t = setTimeout(() => void loadFirstPage(query, kindFilter), 300);
    return () => clearTimeout(t);
  }, [query, kindFilter, mode, loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await fetchArts({
        limit: String(PAGE_SIZE),
        cursor: nextCursor,
        ...(query ? { q: query } : {}),
        ...(kindFilter ? { kind: kindFilter } : {}),
      });
      setArts((prev) => [...prev, ...data.arts]);
      setNextCursor(data.nextCursor);
    } finally {
      loadingRef.current = false;
    }
  }, [nextCursor, query, kindFilter]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, cropArt]);

  async function uploadFiles(files: FileList | File[]) {
    const media = Array.from(files).filter(
      (f) =>
        f.type.startsWith("image/") ||
        f.type.startsWith("video/") ||
        f.type.startsWith("audio/") ||
        // .mov/.m4a often arrive with an empty MIME type
        /\.(mp4|webm|mov|mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(f.name),
    );
    if (!media.length) return;
    setBusy(true);
    try {
      await Promise.all(
        media.map((f) => {
          const fd = new FormData();
          fd.append("file", f);
          return fetch("/api/arts", { method: "POST", body: fd });
        }),
      );
      await loadFirstPage(query, kindFilter);
      onPoolChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function rename(art: GalleryArt, label: string) {
    const next = label.trim() || null;
    if (next === art.label) return;
    await fetch(`/api/arts/${art.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: next }),
    });
    setArts((prev) => prev.map((a) => (a.id === art.id ? { ...a, label: next } : a)));
  }

  async function remove(art: GalleryArt) {
    const used = art.usageCount > 0 ? ` Используется в позициях: ${art.usageCount}.` : "";
    if (!confirm(`Удалить «${art.label ?? "без названия"}»?${used} Действие необратимо.`)) return;
    await fetch(`/api/arts/${art.id}`, { method: "DELETE" });
    setArts((prev) => prev.filter((a) => a.id !== art.id));
    setRecent((prev) => prev.filter((a) => a.id !== art.id));
    onPoolChange?.();
  }

  const title =
    cropArt != null
      ? "Обрезка (рамка 16:9)"
      : mode === "manage"
        ? "Менеджер медиа"
        : "Выбор медиа";

  const visible = (list: GalleryArt[]) =>
    mode === "pick" ? list.filter((a) => pickKinds.includes(a.kind)) : list;

  function card(a: GalleryArt, selectable: boolean) {
    return (
      <div
        key={a.id}
        className={`art-card${selectable ? " selectable" : ""}`}
        onClick={
          selectable
            ? () =>
                a.kind === "audio"
                  ? onPick?.({ artId: a.id, crop: null })
                  : setCropArt({ artId: a.id, artUrl: a.url, kind: a.kind, crop: null })
            : undefined
        }
      >
        {a.kind === "audio" ? (
          <div className="thumb audio-thumb">🎵</div>
        ) : a.kind === "video" && !a.posterUrl ? (
          <video className="thumb" src={a.url} muted preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="thumb"
            src={a.kind === "video" ? a.posterUrl! : a.url}
            alt={a.label ?? "art"}
            loading="lazy"
          />
        )}
        {a.kind === "video" ? (
          <span className="art-badge">
            🎬 {fmtDuration(a.durationSec)}
            {a.hasAudio ? "" : " · без звука"}
          </span>
        ) : a.kind === "audio" ? (
          <span className="art-badge">🎵 {fmtDuration(a.durationSec)}</span>
        ) : null}
        {mode === "manage" ? (
          <>
            <div className="meta">
              <input
                defaultValue={a.label ?? ""}
                placeholder="Название…"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => void rename(a, e.target.value)}
              />
            </div>
            <button
              className="del"
              title="Удалить"
              onClick={(e) => {
                e.stopPropagation();
                void remove(a);
              }}
            >
              ✕
            </button>
          </>
        ) : (
          <div className="meta">{a.label ?? "без названия"}</div>
        )}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} title="Закрыть">✕</button>
        </div>
        <div className="modal-body">
          {cropArt ? (
            <>
              <CropStep
                artUrl={cropArt.artUrl}
                mediaKind={cropArt.kind}
                initialCrop={cropArt.crop}
                onApply={(crop) => onPick?.({ artId: cropArt.artId ?? "", crop })}
                onBack={mode === "crop" ? null : () => setCropArt(null)}
              />
              {cropArt.kind === "video" ? (
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                  Рамка применяется ко всему видеоряду. Видео короче фрагмента
                  будет зациклено.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div
                className={`dropzone${drag ? " drag" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  void uploadFiles(e.dataTransfer.files);
                }}
              >
                {busy
                  ? "Загрузка…"
                  : "Перетащите картинки, видео или аудио сюда или нажмите, чтобы выбрать"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime,audio/*,.mp4,.webm,.mov,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              <UrlImportPanel
                onPoolChange={() => {
                  void loadFirstPage(query, kindFilter);
                  onPoolChange?.();
                }}
              />

              <ShikimoriPanel
                onPoolChange={() => {
                  void loadFirstPage(query, kindFilter);
                  onPoolChange?.();
                }}
              />

              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <input
                  placeholder="🔍 Поиск по названию…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <div className="kind-tabs">
                  {(
                    [
                      ["", "Все"],
                      ["image", "Картинки"],
                      ["video", "Видео"],
                      ["audio", "Аудио"],
                    ] as const
                  )
                    .filter(
                      ([value]) =>
                        mode !== "pick" || value === "" || pickKinds.includes(value),
                    )
                    .map(([value, label]) => (
                    <button
                      key={value}
                      className={`btn ghost${kindFilter === value ? " active" : ""}`}
                      onClick={() => setKindFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "pick" && recent.length > 0 && !query && !kindFilter ? (
                <>
                  <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>Недавние</p>
                  <div className="art-grid" style={{ marginBottom: 14 }}>
                    {visible(recent).map((a) => card(a, true))}
                  </div>
                  <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>Все</p>
                </>
              ) : null}

              {arts.length === 0 ? (
                <p className="muted" style={{ fontSize: 14 }}>
                  {query || kindFilter
                    ? "Ничего не найдено."
                    : "Пул пуст — загрузите первые картинки или видео."}
                </p>
              ) : (
                <div className="art-grid">{visible(arts).map((a) => card(a, mode === "pick"))}</div>
              )}
              <div ref={sentinelRef} style={{ height: 1 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import type { ArtCrop } from "@/lib/domain/art-crop";
import {
  describeUsage,
  describeDeletion,
  type UsageBreakdown,
} from "@/lib/domain/art-usage";
import { ImportSources } from "@/app/components/ImportSources";

export type GalleryKind = "image" | "video" | "audio";

export interface GalleryArt {
  id: string;
  url: string;
  label: string | null;
  kind: GalleryKind;
  posterUrl: string | null;
  durationSec: number | null;
  hasAudio: boolean;
  usage: UsageBreakdown;
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
  aspect = 16 / 9,
}: {
  artUrl: string;
  mediaKind: GalleryKind;
  initialCrop: ArtCrop | null;
  onApply: (crop: ArtCrop | null) => void;
  onBack: (() => void) | null;
  aspect?: number;
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
          aspect={aspect}
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

/**
 * Art gallery modal. mode="manage": import (see ImportSources), rename, delete.
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
  aspect = 16 / 9,
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
  /** Crop aspect ratio (width / height) for the crop step. Defaults to 16:9. */
  aspect?: number;
}) {
  const [arts, setArts] = useState<GalleryArt[]>([]);
  const [recent, setRecent] = useState<GalleryArt[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | GalleryKind>("");
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
    // Say what deletion actually does: cards and playlist entries go away with
    // the media (cascade), top positions are only freed.
    const consequences = describeDeletion(art.usage);
    if (
      !confirm(
        `Удалить «${art.label ?? "без названия"}»?${consequences ? ` ${consequences}.` : ""} Действие необратимо.`,
      )
    )
      return;
    await fetch(`/api/arts/${art.id}`, { method: "DELETE" });
    setArts((prev) => prev.filter((a) => a.id !== art.id));
    setRecent((prev) => prev.filter((a) => a.id !== art.id));
    onPoolChange?.();
  }

  const title =
    cropArt != null
      ? `Обрезка (рамка ${aspect === 2 / 3 ? "2:3" : "16:9"})`
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
              <span className="art-usage" title={describeUsage(a.usage)}>
                {describeUsage(a.usage)}
              </span>
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
                aspect={aspect}
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
              <ImportSources
                onImported={() => {
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

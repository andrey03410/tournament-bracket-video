"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import type { ArtCrop } from "@/lib/domain/art-crop";

export interface GalleryArt {
  id: string;
  url: string;
  label: string | null;
  usageCount: number;
}

export interface PickResult {
  artId: string;
  crop: ArtCrop | null;
}

const PAGE_SIZE = 40;

async function fetchArts(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/arts?${qs}`, { cache: "no-store" });
  if (!res.ok) return { arts: [] as GalleryArt[], nextCursor: null };
  return (await res.json()) as { arts: GalleryArt[]; nextCursor: string | null };
}

/** 16:9 crop editor over one art. Reports a normalized rect (fractions 0..1). */
function CropStep({
  artUrl,
  initialCrop,
  onApply,
  onBack,
}: {
  artUrl: string;
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
          image={artUrl}
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
}: {
  mode: "manage" | "pick" | "crop";
  /** For mode="crop": the art being re-cropped and its current crop. */
  cropTarget?: { artId: string; artUrl: string; crop: ArtCrop | null };
  onPick?: (res: PickResult) => void;
  onClose: () => void;
  /** Called after uploads/deletes so the parent can refresh its own art usages. */
  onPoolChange?: () => void;
}) {
  const [arts, setArts] = useState<GalleryArt[]>([]);
  const [recent, setRecent] = useState<GalleryArt[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [cropArt, setCropArt] = useState<{ artId: string; artUrl: string; crop: ArtCrop | null } | null>(
    mode === "crop" && cropTarget ? cropTarget : null,
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadingRef = useRef(false);

  const loadFirstPage = useCallback(async (q: string) => {
    const data = await fetchArts({ limit: String(PAGE_SIZE), ...(q ? { q } : {}) });
    setArts(data.arts);
    setNextCursor(data.nextCursor);
  }, []);

  // Initial load + recent block (picker only).
  useEffect(() => {
    if (mode === "crop") return;
    void loadFirstPage("");
    if (mode === "pick") {
      void fetchArts({ recent: "1" }).then((d) => setRecent(d.arts));
    }
  }, [mode, loadFirstPage]);

  // Debounced search.
  useEffect(() => {
    if (mode === "crop") return;
    const t = setTimeout(() => void loadFirstPage(query), 300);
    return () => clearTimeout(t);
  }, [query, mode, loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await fetchArts({
        limit: String(PAGE_SIZE),
        cursor: nextCursor,
        ...(query ? { q: query } : {}),
      });
      setArts((prev) => [...prev, ...data.arts]);
      setNextCursor(data.nextCursor);
    } finally {
      loadingRef.current = false;
    }
  }, [nextCursor, query]);

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
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true);
    try {
      await Promise.all(
        images.map((f) => {
          const fd = new FormData();
          fd.append("file", f);
          return fetch("/api/arts", { method: "POST", body: fd });
        }),
      );
      await loadFirstPage(query);
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
        ? "Менеджер артов"
        : "Выбор арта";

  function card(a: GalleryArt, selectable: boolean) {
    return (
      <div
        key={a.id}
        className={`art-card${selectable ? " selectable" : ""}`}
        onClick={
          selectable
            ? () => setCropArt({ artId: a.id, artUrl: a.url, crop: null })
            : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="thumb" src={a.url} alt={a.label ?? "art"} loading="lazy" />
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
            <CropStep
              artUrl={cropArt.artUrl}
              initialCrop={cropArt.crop}
              onApply={(crop) => onPick?.({ artId: cropArt.artId, crop })}
              onBack={mode === "crop" ? null : () => setCropArt(null)}
            />
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
                {busy ? "Загрузка…" : "Перетащите изображения сюда или нажмите, чтобы выбрать"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              <input
                placeholder="🔍 Поиск по названию…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ marginBottom: 12 }}
              />

              {mode === "pick" && recent.length > 0 && !query ? (
                <>
                  <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>Недавние</p>
                  <div className="art-grid" style={{ marginBottom: 14 }}>
                    {recent.map((a) => card(a, true))}
                  </div>
                  <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>Все</p>
                </>
              ) : null}

              {arts.length === 0 ? (
                <p className="muted" style={{ fontSize: 14 }}>
                  {query ? "Ничего не найдено." : "Пул пуст — загрузите первые картинки."}
                </p>
              ) : (
                <div className="art-grid">{arts.map((a) => card(a, mode === "pick"))}</div>
              )}
              <div ref={sentinelRef} style={{ height: 1 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { TopVideo } from "@/remotion/TopVideo";
import type { VideoPlan } from "@/lib/domain/video-plan";
import { artCropStyle, type ArtCrop } from "@/lib/domain/art-crop";
import { ArtGalleryModal, type PickResult } from "./ArtGalleryModal";

// Remotion's Player generic is constrained to Record<string, unknown>; bridge our
// fixed-shape props at this boundary.
const PlayerComp = TopVideo as unknown as React.FC<Record<string, unknown>>;

interface ItemArtDto {
  kind: "image" | "video";
  durationSec: number | null;
  hasAudio: boolean;
  posterUrl: string | null;
}

interface ItemDto {
  id: string;
  trackId: string;
  rank: number;
  title: string;
  artist: string | null;
  trackKind: "audio" | "video";
  audioUrl: string;
  clipMode: "manual" | "active_snippet" | "full";
  clipStartSec: number | null;
  clipEndSec: number | null;
  snippetLenSec: number | null;
  resolvedStartSec: number | null;
  durationSec: number | null;
  customLabel: string | null;
  artId: string | null;
  artUrl: string | null;
  art: ItemArtDto | null;
  artCrop: ArtCrop | null;
  audioSource: "track" | "media";
  mediaStartSec: number | null;
}

/** Per-position thumbnail: image, video poster, or the track's own footage. */
function ItemThumb({ it }: { it: ItemDto }) {
  const style = artCropStyle(it.artCrop);
  if (it.art?.kind === "video" && it.artUrl) {
    return it.art.posterUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={it.art.posterUrl} alt="video" style={style} />
    ) : (
      <video src={it.artUrl} muted preload="metadata" style={style} />
    );
  }
  if (it.artUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={it.artUrl} alt="art" style={style} />;
  }
  if (it.trackKind === "video") {
    return <video src={it.audioUrl} muted preload="metadata" style={style} />;
  }
  return (
    <span
      className="muted"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
      }}
    >
      нет медиа
    </span>
  );
}

function fmtTime(sec: number | null): string {
  if (sec == null) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
interface ConfigDto {
  id: string;
  order: "desc" | "asc";
  defaultClipSec: number;
  introEnabled: boolean;
  introText: string | null;
  outroEnabled: boolean;
  outroText: string | null;
  items: ItemDto[];
}
type ModalState =
  | { kind: "manage" }
  | { kind: "pick"; itemId: string }
  | {
      kind: "crop";
      itemId: string;
      url: string;
      mediaKind: "image" | "video";
      crop: ArtCrop | null;
    }
  | null;

interface JobDto {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  downloadUrl: string | null;
}

export function RenderConstructor({ tournamentId }: { tournamentId: string }) {
  const [config, setConfig] = useState<ConfigDto | null>(null);
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [job, setJob] = useState<JobDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/render/config`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError("Не удалось загрузить конфигурацию рендера");
      return;
    }
    const data = await res.json();
    setConfig(data.config);
    setPlan(data.previewPlan);
  }, [tournamentId]);

  useEffect(() => {
    void loadConfig();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadConfig]);

  async function patchConfig(partial: Record<string, unknown>) {
    await fetch(`/api/tournaments/${tournamentId}/render/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    await loadConfig();
  }

  async function patchItem(itemId: string, partial: Record<string, unknown>) {
    await fetch(`/api/render-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    await loadConfig();
  }

  async function applyPick(itemId: string, res: PickResult) {
    setModal(null);
    await patchItem(itemId, { artId: res.artId, artCrop: res.crop });
  }

  function pollJob(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/render-jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: JobDto = await res.json();
      setJob(data);
      if (data.status === "done" || data.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1500);
  }

  async function startRender() {
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/render`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Не удалось запустить рендер");
      return;
    }
    setJob({ id: data.jobId, status: "queued", progress: 0, error: null, downloadUrl: null });
    pollJob(data.jobId);
  }

  if (error && !config) {
    return <div className="panel"><div className="error">{error}</div></div>;
  }
  if (!config || !plan) {
    return <p className="muted">Загрузка конструктора…</p>;
  }

  return (
    <>
      <div className="panel">
        <h2>Предпросмотр</h2>
        <Player
          component={PlayerComp}
          inputProps={{ plan, assetMode: "url" as const }}
          durationInFrames={Math.max(1, plan.durationInFrames)}
          fps={plan.fps}
          compositionWidth={plan.width}
          compositionHeight={plan.height}
          style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12 }}
          controls
        />
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          В предпросмотре «активный сниппет» играет с начала трека — точный фрагмент
          подбирается при рендере.
        </p>
      </div>

      <div className="panel">
        <h2>Общие настройки</h2>
        <div className="grid-2">
          <div>
            <label>Порядок показа</label>
            <select
              value={config.order}
              onChange={(e) => patchConfig({ order: e.target.value })}
            >
              <option value="desc">Обратный (от N к 1, кульминация на #1)</option>
              <option value="asc">Прямой (от 1 к N)</option>
            </select>
          </div>
          <div>
            <label>Длительность фрагмента по умолчанию (сек)</label>
            <input
              type="number"
              min={1}
              max={600}
              defaultValue={config.defaultClipSec}
              onBlur={(e) => patchConfig({ defaultClipSec: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid-2">
          <div>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={config.introEnabled}
                onChange={(e) => patchConfig({ introEnabled: e.target.checked })}
              />
              <span>Интро</span>
            </label>
            <input
              defaultValue={config.introText ?? ""}
              placeholder="Текст интро"
              onBlur={(e) => patchConfig({ introText: e.target.value })}
            />
          </div>
          <div>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={config.outroEnabled}
                onChange={(e) => patchConfig({ outroEnabled: e.target.checked })}
              />
              <span>Аутро</span>
            </label>
            <input
              defaultValue={config.outroText ?? ""}
              placeholder="Текст аутро"
              onBlur={(e) => patchConfig({ outroText: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Медиа</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Общий пул картинок и видео: массовая загрузка, названия для поиска,
          удаление. Видео можно вставить на позицию как видеоряд (звук — от трека
          или от самого видео).
        </p>
        <button className="btn secondary" onClick={() => setModal({ kind: "manage" })}>
          🖼 Менеджер медиа
        </button>
      </div>

      <div className="panel">
        <h2>Элементы топа</h2>
        {config.items.map((it) => (
          <div key={it.id} style={{ borderBottom: "1px solid var(--border)", padding: "16px 0" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>
                #{it.rank} — {it.title}
                {it.artist ? <span className="muted"> ({it.artist})</span> : null}
              </strong>
            </div>

            <div className="grid-2" style={{ marginTop: 10 }}>
              <div>
                <label>Фрагмент</label>
                <select
                  value={it.clipMode}
                  onChange={(e) => patchItem(it.id, { clipMode: e.target.value })}
                >
                  <option value="active_snippet">Активный сниппет (авто)</option>
                  <option value="manual">Вручную (таймлайн)</option>
                  <option value="full">Весь трек целиком</option>
                </select>
              </div>
              <div>
                <label>Подпись (необязательно)</label>
                <input
                  defaultValue={it.customLabel ?? ""}
                  placeholder={`${it.rank} - ${it.title}${it.artist ? ` (${it.artist})` : ""}`}
                  onBlur={(e) =>
                    patchItem(it.id, { customLabel: e.target.value || null })
                  }
                />
              </div>
            </div>

            {it.clipMode === "manual" ? (
              <div className="grid-2">
                <div>
                  <label>Начало (сек)</label>
                  <input
                    type="number"
                    min={0}
                    defaultValue={it.clipStartSec ?? 0}
                    onBlur={(e) => patchItem(it.id, { clipStartSec: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>Конец (сек)</label>
                  <input
                    type="number"
                    min={0}
                    defaultValue={it.clipEndSec ?? 30}
                    onBlur={(e) => patchItem(it.id, { clipEndSec: Number(e.target.value) })}
                  />
                </div>
              </div>
            ) : it.clipMode === "full" ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Трек играет целиком{it.durationSec ? ` (~${fmtTime(it.durationSec)})` : ""}.
              </p>
            ) : (
              <div>
                <label>Длительность сниппета (сек, пусто = по умолчанию)</label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  defaultValue={it.snippetLenSec ?? ""}
                  onBlur={(e) =>
                    patchItem(it.id, {
                      snippetLenSec: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  style={{ maxWidth: 200 }}
                />
                <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Самый «активный» фрагмент найден с {fmtTime(it.resolvedStartSec)}
                  {it.resolvedStartSec != null && it.snippetLenSec
                    ? ` до ${fmtTime(it.resolvedStartSec + it.snippetLenSec)}`
                    : ""}
                  .
                </p>
              </div>
            )}

            <label>Визуал</label>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <div className="item-art-thumb">
                <ItemThumb it={it} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  <button
                    className="btn secondary"
                    onClick={() => setModal({ kind: "pick", itemId: it.id })}
                  >
                    {it.artId ? "Заменить" : "Выбрать медиа"}
                  </button>
                  {it.artId || it.trackKind === "video" ? (
                    <button
                      className="btn secondary"
                      onClick={() =>
                        setModal({
                          kind: "crop",
                          itemId: it.id,
                          url: it.artUrl ?? it.audioUrl,
                          mediaKind:
                            it.art?.kind === "video" || (!it.artId && it.trackKind === "video")
                              ? "video"
                              : "image",
                          crop: it.artCrop,
                        })
                      }
                    >
                      ✂ Обрезать
                    </button>
                  ) : null}
                  {it.artId ? (
                    <button className="btn ghost" onClick={() => patchItem(it.id, { artId: null })}>
                      {it.trackKind === "video" ? "Вернуть видеоряд трека" : "Убрать"}
                    </button>
                  ) : null}
                </div>

                {it.art?.kind === "video" ? (
                  <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                    🎬 видео{it.art.durationSec ? ` · ${fmtTime(it.art.durationSec)}` : ""}
                    {it.art.hasAudio ? "" : " · без звука"}
                  </p>
                ) : !it.artId && it.trackKind === "video" ? (
                  <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                    🎬 собственный видеоряд трека
                  </p>
                ) : null}

                {it.art?.kind === "video" && it.art.hasAudio ? (
                  <div style={{ marginTop: 8, maxWidth: 320 }}>
                    <label>Звук позиции</label>
                    <select
                      value={it.audioSource}
                      onChange={(e) => patchItem(it.id, { audioSource: e.target.value })}
                    >
                      <option value="track">Трек ({it.trackKind === "video" ? "звук видео-трека" : "OST"})</option>
                      <option value="media">Звук вставленного видео</option>
                    </select>
                    <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      «Звук видео» полностью подменяет трек на этой позиции:
                      фрагмент выбирается по видео.
                    </p>
                  </div>
                ) : null}

                {it.art?.kind === "video" && it.audioSource === "track" ? (
                  <div style={{ marginTop: 8, maxWidth: 320 }}>
                    <label>Старт видеоряда (сек)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      defaultValue={it.mediaStartSec ?? 0}
                      onBlur={(e) =>
                        patchItem(it.id, {
                          mediaStartSec: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Видео идёт без звука поверх трека; если оно короче
                      фрагмента — зациклится.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Рендер</h2>
        {error ? <div className="error">{error}</div> : null}
        <button
          className="btn"
          onClick={startRender}
          disabled={job?.status === "queued" || job?.status === "running"}
        >
          {job?.status === "running" || job?.status === "queued"
            ? "Рендеринг…"
            : "🎬 Рендерить видео"}
        </button>

        {job ? (
          <div style={{ marginTop: 16 }}>
            <div className="progressbar">
              <div style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }} />
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Статус: {job.status} ({Math.round((job.progress ?? 0) * 100)}%)
            </p>
            {job.error ? <div className="error">{job.error}</div> : null}
            {job.status === "done" && job.downloadUrl ? (
              <a className="btn" href={job.downloadUrl}>
                ⬇ Скачать видео
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {modal ? (
        <ArtGalleryModal
          mode={modal.kind}
          cropTarget={
            modal.kind === "crop"
              ? { artUrl: modal.url, kind: modal.mediaKind, crop: modal.crop }
              : undefined
          }
          onPick={
            modal.kind === "pick"
              ? (res) => void applyPick(modal.itemId, res)
              : modal.kind === "crop"
                ? (res) => {
                    setModal(null);
                    void patchItem(modal.itemId, { artCrop: res.crop });
                  }
                : undefined
          }
          onClose={() => setModal(null)}
          onPoolChange={() => void loadConfig()}
        />
      ) : null}
    </>
  );
}

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { TopVideo } from "@/remotion/TopVideo";
import type { VideoPlan } from "@/lib/domain/video-plan";

// Remotion's Player generic is constrained to Record<string, unknown>; bridge our
// fixed-shape props at this boundary.
const PlayerComp = TopVideo as unknown as React.FC<Record<string, unknown>>;

interface ItemDto {
  id: string;
  trackId: string;
  rank: number;
  title: string;
  artist: string | null;
  clipMode: "manual" | "active_snippet" | "full";
  clipStartSec: number | null;
  clipEndSec: number | null;
  snippetLenSec: number | null;
  resolvedStartSec: number | null;
  durationSec: number | null;
  customLabel: string | null;
  artId: string | null;
  artUrl: string | null;
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
interface ArtDto {
  id: string;
  url: string;
  label: string | null;
}
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
  const [arts, setArts] = useState<ArtDto[]>([]);
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

  const loadArts = useCallback(async () => {
    const res = await fetch(`/api/arts`, { cache: "no-store" });
    if (res.ok) setArts((await res.json()).arts);
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadArts();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadConfig, loadArts]);

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

  async function uploadArt(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/arts`, { method: "POST", body: fd });
    if (res.ok) await loadArts();
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
        <h2>Загрузка арта</h2>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadArt(f);
          }}
        />
        {arts.length > 0 ? (
          <div className="row" style={{ flexWrap: "wrap", marginTop: 12, gap: 8 }}>
            {arts.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={a.url}
                alt={a.label ?? "art"}
                style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }}
              />
            ))}
          </div>
        ) : null}
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

            <label>Арт</label>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <button
                className={`btn ${it.artId ? "ghost" : "secondary"}`}
                onClick={() => patchItem(it.id, { artId: null })}
              >
                Без арта
              </button>
              {arts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => patchItem(it.id, { artId: a.id })}
                  style={{
                    padding: 0,
                    border:
                      it.artId === a.id
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                    borderRadius: 8,
                    background: "none",
                    cursor: "pointer",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt="art"
                    style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, display: "block" }}
                  />
                </button>
              ))}
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
    </>
  );
}

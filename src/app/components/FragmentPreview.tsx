"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Inline source player for picking a fragment by ear/eye: scrub the ORIGINAL
 * audio/video, press «Старт отсюда» to write the current position into the
 * fragment field, «▶ Фрагмент» plays exactly the chosen window (auto-stop).
 */
export function FragmentPreview({
  src,
  kind,
  fragmentStartSec,
  fragmentLenSec,
  onSetStart,
}: {
  src: string;
  kind: "audio" | "video";
  /** Current fragment start (sec). */
  fragmentStartSec: number;
  /** Fragment length (sec); the «▶ Фрагмент» button stops after it. */
  fragmentLenSec: number;
  onSetStart: (sec: number) => void;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const [time, setTime] = useState(0);

  // Auto-stop at the fragment end when playing via «▶ Фрагмент».
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onTime = () => {
      setTime(el.currentTime);
      if (stopAtRef.current != null && el.currentTime >= stopAtRef.current) {
        el.pause();
        stopAtRef.current = null;
      }
    };
    const onManualAction = () => {
      // any manual play/seek cancels the pending auto-stop
      stopAtRef.current = null;
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeking", onManualAction);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeking", onManualAction);
    };
  }, [src]);

  function playFragment() {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = fragmentStartSec;
    stopAtRef.current = fragmentStartSec + fragmentLenSec;
    void el.play();
  }

  const fmt = (s: number) => {
    const w = Math.max(0, s);
    return `${Math.floor(w / 60)}:${String(Math.floor(w % 60)).padStart(2, "0")}.${String(Math.floor((w % 1) * 10))}`;
  };

  return (
    <div className="fragment-preview">
      {kind === "video" ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          controls
          preload="metadata"
          style={{ width: "100%", maxHeight: 240, borderRadius: 8, background: "#000" }}
        />
      ) : (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={src}
          controls
          preload="metadata"
          style={{ width: "100%" }}
        />
      )}
      <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn secondary"
          type="button"
          onClick={() => onSetStart(Math.round((mediaRef.current?.currentTime ?? 0) * 10) / 10)}
        >
          📍 Старт отсюда ({fmt(time)})
        </button>
        <button className="btn secondary" type="button" onClick={playFragment}>
          ▶ Фрагмент
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          выбрано: {fmt(fragmentStartSec)} — {fmt(fragmentStartSec + fragmentLenSec)}
        </span>
      </div>
    </div>
  );
}

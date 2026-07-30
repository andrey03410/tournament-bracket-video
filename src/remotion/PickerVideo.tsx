import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { artCropStyle } from "@/lib/domain/art-crop";
import { TitleCard } from "./TitleCard";
import {
  ROUND_GAP_SEC,
  type PickerPlan,
  type PlanMusic,
  type PlanRound,
  type PlanTile,
} from "@/lib/domain/picker-plan";
import type { AssetMode } from "./types";

const BG = "#0b0d12";
const ACCENT = "#7c9cff";
const ANSWER_GLOW = "#ffd166";
const FONT =
  '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

function resolve(mode: AssetMode, p: string | null): string | null {
  if (!p) return null;
  return mode === "static" ? staticFile(p) : p;
}

const sec = (s: number, fps: number) => Math.round(s * fps);

/** Muted looping cover-background (image or video) with a dim overlay. */
const Backdrop: React.FC<{
  bg: PlanRound["bg"];
  mode: AssetMode;
}> = ({ bg, mode }) => {
  const src = resolve(mode, bg?.ref ?? null);
  const cover: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {bg && src ? (
        bg.kind === "video" ? (
          <Loop
            // container duration >= real stream length; overshooting by even a
            // frame flashes black on EVERY loop of the backdrop
            durationInFrames={Math.max(1, Math.floor((bg.durationSec ?? 60) * 30) - 1)}
          >
            <OffthreadVideo muted src={src} style={cover} />
          </Loop>
        ) : (
          <Img src={src} style={cover} />
        )
      ) : null}
      {/* dim so tiles and text stay readable over any backdrop */}
      <AbsoluteFill style={{ background: "rgba(5,7,12,0.62)" }} />
    </AbsoluteFill>
  );
};

/** The moving footage / image inside a tile (live reveal window). */
const TileMedia: React.FC<{ tile: PlanTile; mode: AssetMode }> = ({ tile, mode }) => {
  const { fps } = useVideoConfig();
  const src = resolve(mode, tile.visual.path);
  if (!src) return null;
  if (tile.visual.kind === "video") {
    const video = (
      <OffthreadVideo
        muted
        src={src}
        startFrom={sec(tile.visual.startSec, fps)}
        style={artCropStyle(tile.visual.crop, tile.visual.fitMode)}
      />
    );
    // One frame short of the footage length: seeking past the real EOF of a
    // re-encoded clip flashes black at every loop boundary.
    return tile.visual.loopSec != null ? (
      <Loop durationInFrames={Math.max(1, Math.floor(tile.visual.loopSec * fps) - 1)}>
        {video}
      </Loop>
    ) : (
      video
    );
  }
  return <Img src={src} style={artCropStyle(tile.visual.crop, tile.visual.fitMode)} />;
};

/** Static tile content for the finale (poster frame for videos). */
const TileStill: React.FC<{ tile: PlanTile; mode: AssetMode }> = ({ tile, mode }) => {
  if (tile.visual.kind === "video") {
    const poster = resolve(mode, tile.posterRef);
    if (poster) return <Img src={poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
    return (
      <AbsoluteFill style={{ background: "#1a2030", justifyContent: "center", alignItems: "center", color: "rgba(255,255,255,0.6)", fontSize: 60 }}>
        🎬
      </AbsoluteFill>
    );
  }
  return <TileMedia tile={tile} mode={mode} />;
};

const TileFrame: React.FC<{
  tile: PlanTile;
  children: React.ReactNode;
  label: string | null;
  pop: boolean;
  highlight?: "answer" | "dim" | null;
}> = ({ tile, children, label, pop, highlight = null }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = pop
    ? interpolate(frame, [0, 0.4 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const scale = pop ? 0.7 + 0.3 * anim : highlight === "answer" ? 1.05 : 1;
  const { rect } = tile;
  return (
    <div
      style={{
        position: "absolute",
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
        opacity: highlight === "dim" ? 0.25 : anim,
        transform: `scale(${scale})`,
        transition: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          borderRadius: 18,
          border:
            highlight === "answer"
              ? `6px solid ${ANSWER_GLOW}`
              : "3px solid rgba(255,255,255,0.25)",
          boxShadow:
            highlight === "answer"
              ? `0 0 60px ${ANSWER_GLOW}`
              : "0 12px 40px rgba(0,0,0,0.55)",
          background: "#10131c",
        }}
      >
        {children}
      </div>
      {label ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 14,
            transform: "translateX(-50%)",
            maxWidth: "92%",
            padding: "8px 20px",
            background: "rgba(10,12,18,0.85)",
            border: `2px solid ${highlight === "answer" ? ANSWER_GLOW : ACCENT}`,
            borderRadius: 12,
            color: "white",
            fontSize: 30,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};

/** Big countdown with a ring, shown over the revealed tiles. */
const Timer: React.FC<{ timerSec: number }> = ({ timerSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = frame / fps;
  const left = Math.max(0, timerSec - elapsed);
  const digits = Math.ceil(left);
  const progress = timerSec > 0 ? Math.min(1, elapsed / timerSec) : 1;
  const R = 74;
  const C = 2 * Math.PI * R;
  return (
    <div
      style={{
        position: "absolute",
        top: 24,
        right: 40,
        width: 180,
        height: 180,
      }}
    >
      <svg width={180} height={180}>
        <circle cx={90} cy={90} r={R} stroke="rgba(255,255,255,0.18)" strokeWidth={12} fill="rgba(8,10,16,0.72)" />
        <circle
          cx={90}
          cy={90}
          r={R}
          stroke={ACCENT}
          strokeWidth={12}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * progress}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "white",
          fontSize: 74,
          fontWeight: 800,
          fontFamily: FONT,
        }}
      >
        {digits}
      </div>
    </div>
  );
};

/**
 * Continuous background playlist: cues laid over the WHOLE video with
 * crossfade overlaps; silent during rounds that carry their own music,
 * ducked under tile sounds elsewhere.
 */
const PlaylistAudio: React.FC<{ music: PlanMusic; mode: AssetMode }> = ({
  music,
  mode,
}) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {music.cues.map((cue, i) => {
        const src = resolve(mode, cue.ref);
        if (!src) return null;
        const durFrames = Math.max(1, sec(cue.durationSec, fps));
        return (
          <Sequence key={`cue-${i}`} from={sec(cue.fromSec, fps)} durationInFrames={durFrames}>
            <Audio
              src={src}
              volume={(f) => {
                const t = cue.fromSec + f / fps; // absolute video time
                if (music.muteWindows.some((w) => t >= w.fromSec && t < w.toSec)) return 0;
                const envelope = interpolate(
                  f,
                  [
                    0,
                    cue.fadeInSec * fps,
                    Math.max(cue.fadeInSec * fps + 1, durFrames - cue.fadeOutSec * fps),
                    durFrames,
                  ],
                  [0, 1, 1, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                const ducked = music.duckWindows.some((w) => t >= w.fromSec && t < w.toSec);
                return envelope * (ducked ? 0.15 : 0.9);
              }}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const RoundView: React.FC<{
  round: PlanRound;
  mode: AssetMode;
  tickSrc: string | null;
}> = ({ round, mode, tickSrc }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const t0 = round.startSec;
  const rel = (abs: number) => sec(abs - t0, fps);
  const contentEnd = rel(round.endSec - ROUND_GAP_SEC);
  const finale = rel(round.finaleAtSec);
  const answer = round.answerAtSec != null ? rel(round.answerAtSec) : null;
  const inAnswerPhase = answer != null && frame >= answer;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Backdrop bg={round.bg} mode={mode} />

      {/* Round background music, ducked under sounded tiles */}
      {round.bgMusic ? (
        <Audio
          src={resolve(mode, round.bgMusic.ref)!}
          loop
          volume={(f) => {
            const t = t0 + f / fps;
            const ducked = round.bgMusic!.duckWindows.some(
              (w) => t >= w.fromSec && t < w.toSec,
            );
            return ducked ? 0.15 : 0.9;
          }}
        />
      ) : null}

      {/* Tile own sound during its reveal window */}
      {round.tiles.map((tile, i) =>
        tile.sound ? (
          <Sequence
            key={`snd-${i}`}
            from={rel(tile.sound.fromSec)}
            durationInFrames={Math.max(1, sec(tile.sound.durationSec, fps))}
          >
            <Audio
              src={resolve(mode, tile.sound.ref)!}
              startFrom={sec(tile.sound.startSec, fps)}
            />
          </Sequence>
        ) : null,
      )}

      {/* Prompt plate on top */}
      {round.prompt ? (
        <Sequence durationInFrames={contentEnd}>
          <PromptPlate text={round.prompt} />
        </Sequence>
      ) : null}

      {/* Live reveal windows */}
      {round.tiles.map((tile, i) => {
        const from = rel(tile.revealAtSec);
        const to = tile.hideAtSec != null ? rel(tile.hideAtSec) : finale;
        if (to <= from) return null;
        return (
          <Sequence key={`live-${i}`} from={from} durationInFrames={to - from}>
            <TileFrame
              tile={tile}
              pop
              label={tile.showLabelDuringReveal ? tile.label : null}
            >
              <TileMedia tile={tile} mode={mode} />
            </TileFrame>
          </Sequence>
        );
      })}

      {/* Finale: everything revealed statically + timer (+ answer highlight) */}
      <Sequence from={finale} durationInFrames={Math.max(1, contentEnd - finale)}>
        <AbsoluteFill>
          {round.tiles.map((tile, i) => (
            <TileFrame
              key={`fin-${i}`}
              tile={tile}
              pop={false}
              label={
                inAnswerPhase && tile.isAnswer
                  ? tile.label
                  : tile.showLabelAtFinale
                    ? tile.label
                    : null
              }
              highlight={
                inAnswerPhase ? (tile.isAnswer ? "answer" : "dim") : null
              }
            >
              <TileStill tile={tile} mode={mode} />
            </TileFrame>
          ))}
        </AbsoluteFill>
      </Sequence>

      {/* Countdown ring during the timer window */}
      <Sequence from={finale} durationInFrames={Math.max(1, sec(round.timerSec, fps))}>
        <Timer timerSec={round.timerSec} />
        {round.tickSound && tickSrc
          ? Array.from({ length: Math.max(0, Math.floor(round.timerSec)) }, (_, s) => (
              <Sequence key={`tick-${s}`} from={sec(s, fps)} durationInFrames={Math.max(1, sec(0.5, fps))}>
                <Audio src={tickSrc} />
              </Sequence>
            ))
          : null}
      </Sequence>
    </AbsoluteFill>
  );
};

const PromptPlate: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          marginTop: 36,
          opacity: anim,
          transform: `translateY(${(1 - anim) * -24}px)`,
          maxWidth: "88%",
          padding: "18px 46px",
          background: "rgba(12,14,20,0.85)",
          border: `2px solid ${ACCENT}`,
          borderRadius: 16,
          color: "white",
          fontSize: 52,
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export interface PickerVideoProps {
  plan: PickerPlan;
  assetMode: AssetMode;
  /** Tick sample ref (URL or static path); null disables the tick sound. */
  tickSrc: string | null;
}

export const PickerVideo: React.FC<PickerVideoProps> = ({ plan, assetMode, tickSrc }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {plan.music ? <PlaylistAudio music={plan.music} mode={assetMode} /> : null}

      {/* Title card before the first round (background music keeps playing) */}
      {plan.intro ? (
        <Sequence
          from={sec(plan.intro.fromSec, fps)}
          durationInFrames={Math.max(1, sec(plan.intro.durationSec, fps))}
        >
          <TitleCard title={plan.intro.text} />
        </Sequence>
      ) : null}

      {plan.rounds.map((round) => (
        <Sequence
          key={round.index}
          from={sec(round.startSec, fps)}
          durationInFrames={Math.max(1, sec(round.endSec - round.startSec, fps))}
        >
          <RoundView
            round={round}
            mode={assetMode}
            tickSrc={tickSrc ? resolve(assetMode, tickSrc) : null}
          />
        </Sequence>
      ))}

      {/* Final card after the last round */}
      {plan.outro ? (
        <Sequence
          from={sec(plan.outro.fromSec, fps)}
          durationInFrames={Math.max(1, sec(plan.outro.durationSec, fps))}
        >
          <TitleCard title={plan.outro.text} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

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
import type { PlanSegment, SegmentVisual } from "@/lib/domain/video-plan";
import { artCropStyle } from "@/lib/domain/art-crop";
import type { AssetMode, TopVideoProps } from "./types";

const BG = "#0b0d12";
const ACCENT = "#7c9cff";
const FONT =
  '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

function resolve(mode: AssetMode, p: string | null): string | null {
  if (!p) return null;
  return mode === "static" ? staticFile(p) : p;
}

const Card: React.FC<{ title: string; subtitle?: string | null }> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        opacity,
      }}
    >
      <div style={{ color: "white", fontSize: 96, fontWeight: 800, textAlign: "center" }}>
        {title}
      </div>
      {subtitle ? (
        <div style={{ color: ACCENT, fontSize: 40, marginTop: 24 }}>{subtitle}</div>
      ) : null}
    </AbsoluteFill>
  );
};

/** The segment's background visual: image, (looping) muted video, or #N placeholder. */
const VisualView: React.FC<{ visual: SegmentVisual; rank: number; mode: AssetMode }> = ({
  visual,
  rank,
  mode,
}) => {
  const { fps } = useVideoConfig();
  const src = resolve(mode, visual.path);

  if (visual.kind === "video" && src) {
    // Audio always comes from the segment's own <Audio> element, so footage is muted.
    const video = (
      <OffthreadVideo
        muted
        src={src}
        startFrom={Math.round(visual.startSec * fps)}
        style={artCropStyle(visual.crop)}
      />
    );
    // One frame short of the footage length: probed/re-encoded durations may
    // overshoot the real frame count, and seeking past EOF flashes black.
    return visual.loopSec != null ? (
      <Loop durationInFrames={Math.max(1, Math.floor(visual.loopSec * fps) - 1)}>
        {video}
      </Loop>
    ) : (
      video
    );
  }
  if (visual.kind === "image" && src) {
    return <Img src={src} style={artCropStyle(visual.crop)} />;
  }
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, #1a2030, ${ACCENT})`,
        justifyContent: "center",
        alignItems: "center",
        color: "rgba(255,255,255,0.85)",
        fontSize: 360,
        fontWeight: 800,
      }}
    >
      #{rank}
    </AbsoluteFill>
  );
};

const SegmentView: React.FC<{ seg: PlanSegment; mode: AssetMode }> = ({ seg, mode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = seg.artFadeFrames;
  const artOpacity = interpolate(
    frame,
    [0, fade, seg.durationFrames - fade, seg.durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const labelStart = seg.labelStartFrame;
  const labelEnd = seg.labelStartFrame + seg.labelDurationFrames;
  const labelFade = Math.min(10, Math.floor(seg.labelDurationFrames / 3) || 1);
  const labelOpacity =
    seg.labelDurationFrames <= 0
      ? 0
      : interpolate(
          frame,
          [labelStart, labelStart + labelFade, labelEnd - labelFade, labelEnd],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

  const audio = resolve(mode, seg.audioPath);
  const startFrom = Math.round(seg.clipStartSec * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: FONT }}>
      {audio ? (
        <Audio
          src={audio}
          startFrom={startFrom}
          endAt={startFrom + seg.durationFrames}
          // In preview the audio is the raw source (no pre-clip fades), so the
          // envelope lives here; rendered clips are already faded by ffmpeg.
          volume={
            mode === "url"
              ? (f) =>
                  interpolate(
                    f,
                    [0, 0.3 * fps, seg.durationFrames - fade, seg.durationFrames],
                    [0, 1, 1, 0],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                  )
              : undefined
          }
        />
      ) : null}

      {/* Visual fills the whole frame as a background; per-position crop maps the
          selected rect onto the frame (null -> plain cover) */}
      <AbsoluteFill style={{ opacity: artOpacity, overflow: "hidden" }}>
        <VisualView visual={seg.visual} rank={seg.rank} mode={mode} />
      </AbsoluteFill>

      {/* Dark gradient at the bottom keeps the label readable over any art */}
      <AbsoluteFill
        style={{
          opacity: artOpacity,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 28%, rgba(0,0,0,0) 55%)",
        }}
      />

      {/* Label plate: appears ~1s after the art, holds ~5s, fades out */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
        <div
          style={{
            opacity: labelOpacity,
            transform: `translateY(${(1 - labelOpacity) * 30}px)`,
            marginBottom: 90,
            padding: "22px 48px",
            background: "rgba(12,14,20,0.82)",
            border: `2px solid ${ACCENT}`,
            borderRadius: 18,
            color: "white",
            fontSize: 52,
            fontWeight: 700,
            backdropFilter: "blur(6px)",
          }}
        >
          {seg.label}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const TopVideo: React.FC<TopVideoProps> = ({ plan, assetMode }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {plan.introFrames > 0 ? (
        <Sequence durationInFrames={plan.introFrames}>
          <Card title={plan.introText ?? "Top"} />
        </Sequence>
      ) : null}

      {plan.segments.map((seg) => (
        <Sequence
          key={seg.trackId}
          from={seg.startFrame}
          durationInFrames={seg.durationFrames}
        >
          <SegmentView seg={seg} mode={assetMode} />
        </Sequence>
      ))}

      {plan.outroFrames > 0 ? (
        <Sequence
          from={plan.durationInFrames - plan.outroFrames}
          durationInFrames={plan.outroFrames}
        >
          <Card title={plan.outroText ?? "The End"} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

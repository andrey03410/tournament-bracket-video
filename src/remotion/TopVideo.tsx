import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { PlanSegment } from "@/lib/domain/video-plan";
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

  const art = resolve(mode, seg.artPath);
  const audio = resolve(mode, seg.audioPath);
  const startFrom = Math.round(seg.clipStartSec * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: FONT }}>
      {audio ? (
        <Audio src={audio} startFrom={startFrom} endAt={startFrom + seg.durationFrames} />
      ) : null}

      {/* Art fills the whole frame as a background */}
      <AbsoluteFill style={{ opacity: artOpacity }}>
        {art ? (
          <Img
            src={art}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
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
            #{seg.rank}
          </AbsoluteFill>
        )}
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

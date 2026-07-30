import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// Intro / outro card shared by the top and picker compositions: plain dark
// screen with a fading-in title (and an optional subtitle).

const BG = "#0b0d12";
const ACCENT = "#7c9cff";
const FONT =
  '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

export const TitleCard: React.FC<{ title: string; subtitle?: string | null }> = ({
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
      <div
        style={{
          color: "white",
          fontSize: 96,
          fontWeight: 800,
          textAlign: "center",
          maxWidth: "84%",
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div style={{ color: ACCENT, fontSize: 40, marginTop: 24 }}>{subtitle}</div>
      ) : null}
    </AbsoluteFill>
  );
};

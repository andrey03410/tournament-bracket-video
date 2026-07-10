// Pure computation of the video timeline ("render plan") consumed by Remotion.
// Encodes the animation timing fixed during Phase 2 review:
//   - art fades in, then fades out at the end of its segment
//   - label plate appears ~1s after the art, holds ~5s, then disappears
//   - a 1s pause with fade separates consecutive OST
//   - reverse order N->1 by default (climax on #1)

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const ART_FADE_SEC = 1; // fade in/out of the art (sec)
export const GAP_SEC = 1; // pause with fade between OST
export const LABEL_DELAY_SEC = 1; // label appears 1s after art
export const LABEL_HOLD_SEC = 5; // label visible for 5s

export type DisplayOrder = "desc" | "asc";

export interface PlanItemInput {
  trackId: string;
  rank: number; // 1 = best
  label: string;
  artPath: string | null;
  audioPath: string;
  clipStartSec: number;
  clipSec: number;
}

export interface PlanConfigInput {
  order: DisplayOrder;
  introEnabled: boolean;
  introText?: string | null;
  outroEnabled: boolean;
  outroText?: string | null;
  introSec?: number;
  outroSec?: number;
}

export interface PlanSegment {
  trackId: string;
  rank: number;
  label: string;
  artPath: string | null;
  audioPath: string;
  clipStartSec: number;
  clipSec: number;
  startFrame: number;
  durationFrames: number;
  artFadeFrames: number;
  labelStartFrame: number; // relative to segment start
  labelDurationFrames: number; // relative to segment start
}

export interface VideoPlan {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  introFrames: number;
  outroFrames: number;
  introText: string | null;
  outroText: string | null;
  segments: PlanSegment[];
}

const sec = (s: number) => Math.round(s * FPS);

/** Build the full timeline from the render config and ranked items. */
export function buildVideoPlan(
  config: PlanConfigInput,
  items: PlanItemInput[],
): VideoPlan {
  const introFrames = config.introEnabled ? sec(config.introSec ?? 3) : 0;
  const outroFrames = config.outroEnabled ? sec(config.outroSec ?? 3) : 0;

  // items arrive ranked best->worst (rank 1 first). desc = worst shown first,
  // climax (#1) last. asc = best first.
  const ordered = [...items].sort((a, b) =>
    config.order === "desc" ? b.rank - a.rank : a.rank - b.rank,
  );

  const gapFrames = sec(GAP_SEC);
  const artFadeFrames = sec(ART_FADE_SEC);
  const labelStartFrame = sec(LABEL_DELAY_SEC);

  const segments: PlanSegment[] = [];
  let cursor = introFrames;

  ordered.forEach((item, idx) => {
    const durationFrames = sec(item.clipSec);
    // label appears LABEL_DELAY after art and holds LABEL_HOLD, clamped to segment
    const rawLabelDuration = sec(LABEL_HOLD_SEC);
    const labelDurationFrames = Math.max(
      0,
      Math.min(rawLabelDuration, durationFrames - labelStartFrame),
    );

    segments.push({
      trackId: item.trackId,
      rank: item.rank,
      label: item.label,
      artPath: item.artPath,
      audioPath: item.audioPath,
      clipStartSec: item.clipStartSec,
      clipSec: item.clipSec,
      startFrame: cursor,
      durationFrames,
      artFadeFrames,
      labelStartFrame,
      labelDurationFrames,
    });

    cursor += durationFrames;
    if (idx < ordered.length - 1) cursor += gapFrames; // gap between items only
  });

  const durationInFrames = cursor + outroFrames;

  return {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    durationInFrames,
    introFrames,
    outroFrames,
    introText: config.introText ?? null,
    outroText: config.outroText ?? null,
    segments,
  };
}

/** Render the canonical label "N - Title (Source)". */
export function formatLabel(
  rank: number,
  title: string,
  source?: string | null,
): string {
  return source ? `${rank} - ${title} (${source})` : `${rank} - ${title}`;
}

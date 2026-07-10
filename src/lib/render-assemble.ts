import { formatLabel, type PlanItemInput, type SegmentVisual } from "./domain/video-plan";
import type { ArtCrop } from "./domain/art-crop";
import { resolveFootage } from "./domain/position-media";

// Pure assembly of plan items from render-config rows. Kept framework-free so it
// can be unit-tested and reused by both the live preview and the server render.

export type ClipMode = "manual" | "active_snippet" | "full";

export interface AssembleConfig {
  defaultClipSec: number;
}

/** The position's visual, already resolved to a concrete asset by the caller. */
export interface AssembleVisual {
  kind: "image" | "video";
  /** Asset reference (basename for static render, URL for preview). */
  ref: string;
  /** Non-destructive per-position crop; null = auto cover. */
  crop: ArtCrop | null;
  /** Video only: footage start offset (sec) when not synced to the audio. */
  startSec?: number;
  /** Video only: source footage length if known — drives loop math. */
  footageDurationSec?: number | null;
  /** Video only: footage is the same media the audio comes from — play the
   * exact audio fragment (video track footage, or a pool video whose sound
   * was chosen as the position's audio). */
  syncedToAudio?: boolean;
}

export interface AssembleItem {
  trackId: string;
  rank: number;
  title: string;
  artist: string | null;
  customLabel: string | null;
  clipMode: ClipMode;
  clipStartSec: number | null;
  clipEndSec: number | null;
  snippetLenSec: number | null;
  /** Total length (sec) of the AUDIO source (track or pool video). */
  durationSec: number | null;
  visual: AssembleVisual | null;
  audioRef: string;
  /** For active_snippet, the start resolved by RMS analysis. null -> use 0. */
  resolvedStartSec?: number | null;
}

/** Clip length in seconds for one item, honoring full / manual range / snippet / default. */
export function resolveClipSec(item: AssembleItem, config: AssembleConfig): number {
  if (item.clipMode === "full") {
    return item.durationSec && item.durationSec > 0 ? item.durationSec : config.defaultClipSec;
  }
  if (item.clipMode === "manual") {
    const start = item.clipStartSec ?? 0;
    const end = item.clipEndSec;
    if (end != null && end > start) return end - start;
    return config.defaultClipSec;
  }
  return item.snippetLenSec ?? config.defaultClipSec;
}

/** Clip start in seconds for one item. */
export function resolveClipStart(item: AssembleItem): number {
  if (item.clipMode === "manual") return item.clipStartSec ?? 0;
  if (item.clipMode === "active_snippet") return item.resolvedStartSec ?? 0;
  return 0; // full
}

function resolveVisual(
  visual: AssembleVisual | null,
  clipStartSec: number,
  clipSec: number,
): SegmentVisual {
  if (!visual) return { kind: "none", path: null, crop: null, startSec: 0, loopSec: null };
  if (visual.kind === "image") {
    return { kind: "image", path: visual.ref, crop: visual.crop, startSec: 0, loopSec: null };
  }
  if (visual.syncedToAudio) {
    // Footage mirrors the audio fragment exactly — no loop by construction.
    return { kind: "video", path: visual.ref, crop: visual.crop, startSec: clipStartSec, loopSec: null };
  }
  const footage = resolveFootage(
    visual.startSec ?? 0,
    visual.footageDurationSec ?? null,
    clipSec,
  );
  return {
    kind: "video",
    path: visual.ref,
    crop: visual.crop,
    startSec: footage.startSec,
    loopSec: footage.loopSec,
  };
}

export function assemblePlanItems(
  items: AssembleItem[],
  config: AssembleConfig,
): PlanItemInput[] {
  return items.map((item) => {
    const clipStartSec = resolveClipStart(item);
    let clipSec = resolveClipSec(item, config);
    // Never allocate a segment longer than the audio source can fill.
    if (item.durationSec != null && item.durationSec > 0) {
      clipSec = Math.min(clipSec, Math.max(0.5, item.durationSec - clipStartSec));
    }
    clipSec = Math.max(0.5, clipSec);
    return {
      trackId: item.trackId,
      rank: item.rank,
      label: item.customLabel?.trim() || formatLabel(item.rank, item.title, item.artist),
      visual: resolveVisual(item.visual, clipStartSec, clipSec),
      audioPath: item.audioRef,
      clipStartSec,
      clipSec,
    };
  });
}

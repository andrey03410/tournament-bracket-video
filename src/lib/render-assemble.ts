import { formatLabel, type PlanItemInput } from "./domain/video-plan";
import type { ArtCrop } from "./domain/art-crop";

// Pure assembly of plan items from render-config rows. Kept framework-free so it
// can be unit-tested and reused by both the live preview and the server render.

export type ClipMode = "manual" | "active_snippet" | "full";

export interface AssembleConfig {
  defaultClipSec: number;
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
  /** Total track length (sec), needed for "full" mode. */
  durationSec: number | null;
  /** Resolved asset references (basename for static render, URL for preview). */
  artRef: string | null;
  /** Non-destructive per-position crop of the art; null = auto cover. */
  artCrop?: ArtCrop | null;
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

export function assemblePlanItems(
  items: AssembleItem[],
  config: AssembleConfig,
): PlanItemInput[] {
  return items.map((item) => ({
    trackId: item.trackId,
    rank: item.rank,
    label: item.customLabel?.trim() || formatLabel(item.rank, item.title, item.artist),
    artPath: item.artRef,
    artCrop: item.artCrop ?? null,
    audioPath: item.audioRef,
    clipStartSec: resolveClipStart(item),
    clipSec: Math.max(0.5, resolveClipSec(item, config)),
  }));
}

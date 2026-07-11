// Picker-mode plan: pure timing/layout math shared by the Player preview and
// the headless render (same contract idea as video-plan.ts for tops).

import type { ArtCrop } from "./art-crop";
import { resolveFootage } from "./position-media";
import { pickerLayout, type TileRect } from "./picker-layout";
import type { SegmentVisual } from "./video-plan";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const TILE_ANIM_SEC = 0.4; // pop-in animation of a tile
export const PROMPT_INTRO_SEC = 1.5; // beat before the first tile when a prompt is shown
export const NO_PROMPT_INTRO_SEC = 0.5;
export const ANSWER_SEC = 2.5; // answer-highlight phase
export const ROUND_GAP_SEC = 0.7; // dark gap between rounds

export type LabelsMode = "always" | "finale" | "never";

export interface PickerDefaults {
  revealSec: number;
  hideAfterReveal: boolean;
  timerSec: number;
  tickSound: boolean;
}

export interface TileMediaInput {
  kind: "image" | "video";
  /** Opaque ref: URL for preview, file path for render. */
  ref: string;
  posterRef: string | null;
  durationSec: number | null;
  hasAudio: boolean;
}

export interface PlanTileInput {
  media: TileMediaInput;
  crop: ArtCrop | null;
  startSec: number | null;
  label: string | null;
  isAnswer: boolean;
  playSound: boolean;
}

export interface PlanRoundInput {
  prompt: string | null;
  showPrompt: boolean;
  labelsMode: LabelsMode;
  revealSec: number | null; // null = inherit default
  hideAfterReveal: boolean | null;
  timerSec: number | null;
  bg: { kind: "image" | "video"; ref: string } | null;
  bgMusic: { ref: string; durationSec: number | null } | null;
  tiles: PlanTileInput[];
}

export interface PlanTile {
  rect: TileRect;
  visual: SegmentVisual;
  posterRef: string | null; // static frame for the finale (video tiles)
  label: string | null;
  isAnswer: boolean;
  /** Absolute times (sec from video start). */
  revealAtSec: number;
  /** End of the tile's own window; null = stays visible until the finale. */
  hideAtSec: number | null;
  /** Sound of the tile's own footage during its window (video with audio). */
  sound: { fromSec: number; durationSec: number; ref: string; startSec: number } | null;
  showLabelDuringReveal: boolean;
  showLabelAtFinale: boolean;
}

export interface PlanRound {
  index: number;
  startSec: number;
  endSec: number;
  prompt: string | null; // null when hidden
  tiles: PlanTile[];
  finaleAtSec: number;
  timerSec: number;
  tickSound: boolean;
  /** Answer-highlight phase start; null when the round has no marked answer. */
  answerAtSec: number | null;
  bg: { kind: "image" | "video"; ref: string } | null;
  bgMusic: {
    ref: string;
    durationSec: number | null;
    /** Windows (absolute sec) where the music ducks under a tile's own sound. */
    duckWindows: { fromSec: number; toSec: number }[];
  } | null;
}

export interface PickerPlan {
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  durationInFrames: number;
  rounds: PlanRound[];
}

export function buildPickerPlan(
  defaults: PickerDefaults,
  rounds: PlanRoundInput[],
): PickerPlan {
  let cursor = 0;
  const planRounds: PlanRound[] = [];

  rounds.forEach((round, index) => {
    if (round.tiles.length === 0) return; // nothing to show — skipped entirely

    const revealSec = round.revealSec ?? defaults.revealSec;
    const hideAfter = round.hideAfterReveal ?? defaults.hideAfterReveal;
    const timerSec = round.timerSec ?? defaults.timerSec;
    const rects = pickerLayout(Math.max(2, Math.min(9, round.tiles.length)));

    const startSec = cursor;
    const promptShown = round.showPrompt && !!round.prompt?.trim();
    const introSec = promptShown ? PROMPT_INTRO_SEC : NO_PROMPT_INTRO_SEC;
    const finaleAtSec = startSec + introSec + round.tiles.length * revealSec;
    const hasAnswer = round.tiles.some((t) => t.isAnswer);
    const answerAtSec = hasAnswer ? finaleAtSec + timerSec : null;
    const endSec =
      finaleAtSec + timerSec + (hasAnswer ? ANSWER_SEC : 0) + ROUND_GAP_SEC;

    const duckWindows: { fromSec: number; toSec: number }[] = [];
    const tiles: PlanTile[] = round.tiles.map((tile, i) => {
      const revealAtSec = startSec + introSec + i * revealSec;
      const start = Math.max(0, tile.startSec ?? 0);
      const footage =
        tile.media.kind === "video"
          ? resolveFootage(start, tile.media.durationSec, revealSec)
          : { startSec: 0, loopSec: null };
      const visual: SegmentVisual = {
        kind: tile.media.kind,
        path: tile.media.ref,
        crop: tile.crop,
        startSec: footage.startSec,
        loopSec: footage.loopSec,
      };

      let sound: PlanTile["sound"] = null;
      if (tile.media.kind === "video" && tile.playSound && tile.media.hasAudio) {
        const available =
          tile.media.durationSec != null
            ? Math.max(0, tile.media.durationSec - footage.startSec)
            : revealSec;
        const durationSec = Math.min(revealSec, available);
        if (durationSec > 0.05) {
          sound = {
            fromSec: revealAtSec,
            durationSec,
            ref: tile.media.ref,
            startSec: footage.startSec,
          };
          duckWindows.push({ fromSec: revealAtSec, toSec: revealAtSec + durationSec });
        }
      }

      return {
        rect: rects[i],
        visual,
        posterRef: tile.media.posterRef,
        label: tile.label?.trim() || null,
        isAnswer: tile.isAnswer,
        revealAtSec,
        hideAtSec: hideAfter ? revealAtSec + revealSec : null,
        sound,
        showLabelDuringReveal: round.labelsMode === "always",
        showLabelAtFinale: round.labelsMode !== "never",
      };
    });

    planRounds.push({
      index,
      startSec,
      endSec,
      prompt: promptShown ? round.prompt!.trim() : null,
      tiles,
      finaleAtSec,
      timerSec,
      tickSound: defaults.tickSound,
      answerAtSec,
      bg: round.bg,
      bgMusic: round.bgMusic
        ? { ref: round.bgMusic.ref, durationSec: round.bgMusic.durationSec, duckWindows }
        : null,
    });
    cursor = endSec;
  });

  const durationSec = Math.max(cursor, 1);
  return {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    durationSec,
    durationInFrames: Math.round(durationSec * FPS),
    rounds: planRounds,
  };
}

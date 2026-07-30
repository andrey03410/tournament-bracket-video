// Picker-mode plan: pure timing/layout math shared by the Player preview and
// the headless render (same contract idea as video-plan.ts for tops).

import type { ArtCrop, FitMode } from "./art-crop";
import { resolveFootage } from "./position-media";
import { pickerLayout, type TileRect, type TileOrientation } from "./picker-layout";
import type { SegmentVisual } from "./video-plan";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const TILE_ANIM_SEC = 0.4; // pop-in animation of a tile
export const PROMPT_INTRO_SEC = 1.5; // beat before the first tile when a prompt is shown
export const NO_PROMPT_INTRO_SEC = 0.5;
export const ANSWER_SEC = 2.5; // answer-highlight phase
export const ROUND_GAP_SEC = 0.7; // dark gap between rounds
export const MUSIC_FADE_SEC = 1; // playlist crossfade (and loop) length
export const BOOKEND_SEC = 3; // title / final card length (same as tops)

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
  fitMode: FitMode;
}

export interface PlanRoundInput {
  prompt: string | null;
  showPrompt: boolean;
  labelsMode: LabelsMode;
  revealSec: number | null; // null = inherit default
  hideAfterReveal: boolean | null;
  timerSec: number | null;
  bg: { kind: "image" | "video"; ref: string; durationSec: number | null } | null;
  bgMusic: { ref: string; durationSec: number | null } | null;
  orientation: TileOrientation;
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

export interface MusicTrackInput {
  /** Opaque ref: URL for preview, file basename for render. */
  ref: string;
  durationSec: number | null;
}

export interface MusicCue {
  ref: string;
  fromSec: number;
  durationSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface PlanMusic {
  cues: MusicCue[];
  /** Rounds with their own music override: the playlist is silent there. */
  muteWindows: { fromSec: number; toSec: number }[];
  /** Tile-sound windows of rounds WITHOUT an override (playlist ducks there). */
  duckWindows: { fromSec: number; toSec: number }[];
}

/**
 * Lay the playlist over the whole video: tracks back to back with a crossfade
 * overlap, looping until the video ends. The last cue may overhang the video
 * end (the composition clamps it).
 */
export function buildMusicCues(
  tracks: MusicTrackInput[],
  totalSec: number,
): MusicCue[] {
  const usable = tracks.filter((t) => (t.durationSec ?? 0) > 0.2);
  if (usable.length === 0 || totalSec <= 0) return [];
  const cues: MusicCue[] = [];
  let t = 0;
  let i = 0;
  while (t < totalSec && cues.length < 500) {
    const track = usable[i % usable.length];
    const durationSec = Math.min(track.durationSec!, totalSec - t + MUSIC_FADE_SEC);
    cues.push({
      ref: track.ref,
      fromSec: t,
      durationSec,
      fadeInSec: MUSIC_FADE_SEC,
      fadeOutSec: MUSIC_FADE_SEC,
    });
    // advance by the audible (non-overlapped) part; floor keeps progress even
    // for pathologically short tracks
    t += Math.max(0.5, durationSec - MUSIC_FADE_SEC);
    i++;
  }
  return cues;
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
  /** Tile own-sound windows of this round (absolute sec). */
  duckWindows: { fromSec: number; toSec: number }[];
  bg: { kind: "image" | "video"; ref: string; durationSec: number | null } | null;
  bgMusic: {
    ref: string;
    durationSec: number | null;
    /** Windows (absolute sec) where the music ducks under a tile's own sound. */
    duckWindows: { fromSec: number; toSec: number }[];
  } | null;
}

/** Title / final card: text with a length, laid at the very start / very end. */
export interface PlanBookend {
  text: string;
  fromSec: number;
  durationSec: number;
}

/** Bookend request: text (already resolved to a non-empty string) or null = off. */
export interface BookendsInput {
  intro: { text: string } | null;
  outro: { text: string } | null;
}

export interface PickerPlan {
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  durationInFrames: number;
  rounds: PlanRound[];
  /** Continuous background playlist; null when the project has none. */
  music: PlanMusic | null;
  /** Title card before the first round; null when disabled. */
  intro: PlanBookend | null;
  /** Final card after the last round; null when disabled. */
  outro: PlanBookend | null;
}

export function buildPickerPlan(
  defaults: PickerDefaults,
  rounds: PlanRoundInput[],
  playlist: MusicTrackInput[] = [],
  bookends: BookendsInput = { intro: null, outro: null },
): PickerPlan {
  // Bookends only make sense around real content: a project with no renderable
  // round stays an empty timeline (the constructor shows a hint instead).
  const hasContent = rounds.some((r) => r.tiles.length > 0);
  const introSec = hasContent && bookends.intro ? BOOKEND_SEC : 0;
  const outroSec = hasContent && bookends.outro ? BOOKEND_SEC : 0;

  let cursor = introSec;
  const planRounds: PlanRound[] = [];

  rounds.forEach((round, index) => {
    if (round.tiles.length === 0) return; // nothing to show — skipped entirely

    const revealSec = round.revealSec ?? defaults.revealSec;
    const hideAfter = round.hideAfterReveal ?? defaults.hideAfterReveal;
    const timerSec = round.timerSec ?? defaults.timerSec;
    const rects = pickerLayout(Math.max(2, Math.min(9, round.tiles.length)), round.orientation);

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
        fitMode: tile.fitMode,
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
      duckWindows,
      bg: round.bg,
      bgMusic: round.bgMusic
        ? { ref: round.bgMusic.ref, durationSec: round.bgMusic.durationSec, duckWindows }
        : null,
    });
    cursor = endSec;
  });

  const durationSec = Math.max(cursor + outroSec, 1);

  let music: PlanMusic | null = null;
  if (playlist.length > 0) {
    music = {
      cues: buildMusicCues(playlist, durationSec),
      // rounds with their own music silence the playlist for their span
      muteWindows: planRounds
        .filter((r) => r.bgMusic)
        .map((r) => ({ fromSec: r.startSec, toSec: r.endSec })),
      duckWindows: planRounds
        .filter((r) => !r.bgMusic)
        .flatMap((r) => r.duckWindows),
    };
  }

  return {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    durationSec,
    durationInFrames: Math.round(durationSec * FPS),
    rounds: planRounds,
    music,
    intro:
      introSec > 0
        ? { text: bookends.intro!.text, fromSec: 0, durationSec: introSec }
        : null,
    outro:
      outroSec > 0
        ? { text: bookends.outro!.text, fromSec: cursor, durationSec: outroSec }
        : null,
  };
}

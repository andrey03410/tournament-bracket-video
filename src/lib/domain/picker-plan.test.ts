import { describe, expect, it } from "vitest";
import {
  buildPickerPlan,
  ANSWER_SEC,
  PROMPT_INTRO_SEC,
  NO_PROMPT_INTRO_SEC,
  ROUND_GAP_SEC,
  type PickerDefaults,
  type PlanRoundInput,
  type PlanTileInput,
} from "./picker-plan";

const DEFAULTS: PickerDefaults = {
  revealSec: 4,
  hideAfterReveal: false,
  timerSec: 5,
  tickSound: true,
};

function imageTile(over: Partial<PlanTileInput> = {}): PlanTileInput {
  return {
    media: { kind: "image", ref: "img.png", posterRef: null, durationSec: null, hasAudio: false },
    crop: null,
    startSec: null,
    label: null,
    isAnswer: false,
    playSound: true,
    ...over,
  };
}

function videoTile(
  durationSec: number,
  over: Partial<PlanTileInput> = {},
): PlanTileInput {
  return {
    media: { kind: "video", ref: "clip.mp4", posterRef: "poster.jpg", durationSec, hasAudio: true },
    crop: null,
    startSec: null,
    label: null,
    isAnswer: false,
    playSound: true,
    ...over,
  };
}

function round(tiles: PlanTileInput[], over: Partial<PlanRoundInput> = {}): PlanRoundInput {
  return {
    prompt: "Выбери персонажа",
    showPrompt: true,
    labelsMode: "finale",
    revealSec: null,
    hideAfterReveal: null,
    timerSec: null,
    bg: null,
    bgMusic: null,
    tiles,
    ...over,
  };
}

describe("buildPickerPlan timings", () => {
  it("sequences tiles by revealSec after the prompt intro", () => {
    const plan = buildPickerPlan(DEFAULTS, [round([imageTile(), imageTile(), imageTile()])]);
    const r = plan.rounds[0];
    expect(r.tiles.map((t) => t.revealAtSec)).toEqual([
      PROMPT_INTRO_SEC,
      PROMPT_INTRO_SEC + 4,
      PROMPT_INTRO_SEC + 8,
    ]);
    expect(r.finaleAtSec).toBe(PROMPT_INTRO_SEC + 12);
    expect(r.answerAtSec).toBeNull();
    expect(r.endSec).toBeCloseTo(r.finaleAtSec + 5 + ROUND_GAP_SEC, 9);
    expect(plan.durationSec).toBeCloseTo(r.endSec, 9);
  });

  it("hidden prompt uses the short intro and drops the text from the plan", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([imageTile(), imageTile()], { showPrompt: false }),
    ]);
    expect(plan.rounds[0].prompt).toBeNull();
    expect(plan.rounds[0].tiles[0].revealAtSec).toBe(NO_PROMPT_INTRO_SEC);
  });

  it("round overrides beat project defaults; second round starts where the first ended", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([imageTile(), imageTile()], { revealSec: 2, timerSec: 3 }),
      round([imageTile(), imageTile()]),
    ]);
    const [a, b] = plan.rounds;
    expect(a.finaleAtSec).toBe(PROMPT_INTRO_SEC + 4); // 2 tiles * 2s
    expect(a.timerSec).toBe(3);
    expect(b.startSec).toBeCloseTo(a.endSec, 9);
    expect(b.timerSec).toBe(5); // default
  });

  it("hideAfterReveal closes each tile window; default keeps tiles open until finale", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([imageTile(), imageTile()], { hideAfterReveal: true }),
      round([imageTile(), imageTile()]),
    ]);
    const hidden = plan.rounds[0].tiles;
    expect(hidden[0].hideAtSec).toBe(hidden[0].revealAtSec + 4);
    const open = plan.rounds[1].tiles;
    expect(open.every((t) => t.hideAtSec === null)).toBe(true);
  });

  it("answer round gets the highlight phase after the timer", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([imageTile(), imageTile({ isAnswer: true })]),
    ]);
    const r = plan.rounds[0];
    expect(r.answerAtSec).toBeCloseTo(r.finaleAtSec + r.timerSec, 9);
    expect(r.endSec).toBeCloseTo(r.finaleAtSec + r.timerSec + ANSWER_SEC + ROUND_GAP_SEC, 9);
  });

  it("empty rounds are skipped without breaking the timeline", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([]),
      round([imageTile(), imageTile()]),
    ]);
    expect(plan.rounds).toHaveLength(1);
    expect(plan.rounds[0].startSec).toBe(0);
  });
});

describe("buildPickerPlan sound & footage", () => {
  it("sounded video tile ducks the round music during its window", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([videoTile(30), imageTile()], {
        bgMusic: { ref: "music.mp3", durationSec: 60 },
      }),
    ]);
    const r = plan.rounds[0];
    const tile = r.tiles[0];
    expect(tile.sound).toEqual({
      fromSec: tile.revealAtSec,
      durationSec: 4,
      ref: "clip.mp4",
      startSec: 0,
    });
    expect(r.bgMusic!.duckWindows).toEqual([
      { fromSec: tile.revealAtSec, toSec: tile.revealAtSec + 4 },
    ]);
  });

  it("short video loops its footage but the sound is not stretched", () => {
    const plan = buildPickerPlan(DEFAULTS, [round([videoTile(1.5), imageTile()])]);
    const tile = plan.rounds[0].tiles[0];
    expect(tile.visual.loopSec).toBeCloseTo(1.5, 9);
    expect(tile.sound!.durationSec).toBeCloseTo(1.5, 9);
  });

  it("startSec shifts the footage and shrinks the sound window", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([videoTile(10, { startSec: 7 }), imageTile()]),
    ]);
    const tile = plan.rounds[0].tiles[0];
    expect(tile.visual.startSec).toBe(7);
    expect(tile.visual.loopSec).toBeCloseTo(3, 9); // 3s left < 4s reveal
    expect(tile.sound!.durationSec).toBeCloseTo(3, 9);
  });

  it("muted tiles and images produce no sound and no ducking", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round(
        [
          videoTile(30, { playSound: false }),
          videoTile(30, { media: { kind: "video", ref: "silent.mp4", posterRef: null, durationSec: 30, hasAudio: false } }),
          imageTile(),
        ],
        { bgMusic: { ref: "music.mp3", durationSec: 60 } },
      ),
    ]);
    const r = plan.rounds[0];
    expect(r.tiles.every((t) => t.sound === null)).toBe(true);
    expect(r.bgMusic!.duckWindows).toEqual([]);
  });
});

describe("buildPickerPlan labels", () => {
  it("labelsMode drives when a label may show", () => {
    const mk = (mode: "always" | "finale" | "never") =>
      buildPickerPlan(DEFAULTS, [
        round([imageTile({ label: "Rem" }), imageTile()], { labelsMode: mode }),
      ]).rounds[0].tiles[0];
    expect(mk("always")).toMatchObject({ showLabelDuringReveal: true, showLabelAtFinale: true });
    expect(mk("finale")).toMatchObject({ showLabelDuringReveal: false, showLabelAtFinale: true });
    expect(mk("never")).toMatchObject({ showLabelDuringReveal: false, showLabelAtFinale: false });
  });

  it("blank labels are normalized to null", () => {
    const plan = buildPickerPlan(DEFAULTS, [
      round([imageTile({ label: "  " }), imageTile()]),
    ]);
    expect(plan.rounds[0].tiles[0].label).toBeNull();
  });
});

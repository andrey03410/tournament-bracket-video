import { describe, it, expect } from "vitest";
import {
  buildVideoPlan,
  formatLabel,
  FPS,
  GAP_SEC,
  LABEL_DELAY_SEC,
  LABEL_HOLD_SEC,
  type PlanItemInput,
} from "./video-plan";

function items(n: number): PlanItemInput[] {
  return Array.from({ length: n }, (_, i) => ({
    trackId: `t${i + 1}`,
    rank: i + 1,
    label: `${i + 1} - Track ${i + 1}`,
    artPath: null,
    audioPath: `/a/${i + 1}.mp3`,
    clipStartSec: 0,
    clipSec: 30,
  }));
}

describe("formatLabel", () => {
  it("formats N - Title (Source)", () => {
    expect(formatLabel(5, "Roaring Tides", "Clannad")).toBe(
      "5 - Roaring Tides (Clannad)",
    );
  });
  it("omits source when absent", () => {
    expect(formatLabel(1, "Main Theme")).toBe("1 - Main Theme");
    expect(formatLabel(1, "Main Theme", null)).toBe("1 - Main Theme");
  });
});

describe("buildVideoPlan", () => {
  const baseConfig = {
    order: "desc" as const,
    introEnabled: true,
    introText: "My Top",
    outroEnabled: true,
    outroText: "The End",
    introSec: 3,
    outroSec: 3,
  };

  it("orders desc (worst first, #1 last)", () => {
    const plan = buildVideoPlan(baseConfig, items(3));
    expect(plan.segments.map((s) => s.rank)).toEqual([3, 2, 1]);
  });

  it("orders asc (best first)", () => {
    const plan = buildVideoPlan({ ...baseConfig, order: "asc" }, items(3));
    expect(plan.segments.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it("computes total duration = intro + items + gaps + outro", () => {
    const n = 3;
    const plan = buildVideoPlan(baseConfig, items(n));
    const introF = 3 * FPS;
    const outroF = 3 * FPS;
    const itemF = 30 * FPS;
    const gapF = GAP_SEC * FPS;
    const expected = introF + n * itemF + (n - 1) * gapF + outroF;
    expect(plan.durationInFrames).toBe(expected);
  });

  it("places segments sequentially with gaps between them only", () => {
    const plan = buildVideoPlan(baseConfig, items(2));
    const [s0, s1] = plan.segments;
    expect(s0.startFrame).toBe(plan.introFrames);
    expect(s1.startFrame).toBe(
      s0.startFrame + s0.durationFrames + GAP_SEC * FPS,
    );
  });

  it("delays the label and holds it ~5s", () => {
    const plan = buildVideoPlan(baseConfig, items(1));
    const seg = plan.segments[0];
    expect(seg.labelStartFrame).toBe(LABEL_DELAY_SEC * FPS);
    expect(seg.labelDurationFrames).toBe(LABEL_HOLD_SEC * FPS);
  });

  it("clamps label hold to the segment length", () => {
    const short = items(1).map((it) => ({ ...it, clipSec: 3 }));
    const plan = buildVideoPlan(baseConfig, short);
    const seg = plan.segments[0];
    // segment is 3s, label starts at 1s -> at most 2s of hold
    expect(seg.labelDurationFrames).toBe(2 * FPS);
  });

  it("respects per-item clip duration overrides", () => {
    const mixed = items(2);
    mixed[0].clipSec = 10;
    mixed[1].clipSec = 40;
    const plan = buildVideoPlan({ ...baseConfig, order: "asc" }, mixed);
    expect(plan.segments[0].durationFrames).toBe(10 * FPS);
    expect(plan.segments[1].durationFrames).toBe(40 * FPS);
  });

  it("drops intro/outro frames when disabled", () => {
    const plan = buildVideoPlan(
      { ...baseConfig, introEnabled: false, outroEnabled: false },
      items(1),
    );
    expect(plan.introFrames).toBe(0);
    expect(plan.outroFrames).toBe(0);
    expect(plan.segments[0].startFrame).toBe(0);
  });
});

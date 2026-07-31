import { describe, expect, it } from "vitest";
import {
  groupLayout,
  groupSplits,
  MAX_GROUPS,
  MAX_GROUP_TILES,
  MAX_GROUP_CARDS,
  type TileRect,
} from "./picker-layout";

const FRAME = 16 / 9;
const pxAspect = (r: TileRect) => (r.w / r.h) * FRAME;
function overlaps(a: TileRect, b: TileRect) {
  return (
    a.x < b.x + b.w - 1e-9 &&
    b.x < a.x + a.w - 1e-9 &&
    a.y < b.y + b.h - 1e-9 &&
    b.y < a.y + a.h - 1e-9
  );
}
const inside = (r: TileRect) =>
  r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

describe("groupSplits", () => {
  it("offers the sensible row splits of one block", () => {
    expect(groupSplits(1)).toEqual([[1]]);
    expect(groupSplits(2)).toEqual([[2]]);
    expect(groupSplits(3)).toEqual([[3]]); // 1..3 cards always stay one row
    expect(groupSplits(4)).toEqual([[4], [2, 2]]);
    expect(groupSplits(5)).toEqual([[5], [3, 2]]);
  });

  it("rejects block sizes outside 1..5", () => {
    expect(() => groupSplits(0)).toThrow("BAD_GROUP_SIZE");
    expect(() => groupSplits(6)).toThrow("BAD_GROUP_SIZE");
  });
});

describe("groupLayout limits", () => {
  it("keeps the agreed caps", () => {
    expect(MAX_GROUPS).toBe(3);
    expect(MAX_GROUP_TILES).toBe(5);
    expect(MAX_GROUP_CARDS).toBe(15);
  });

  it("needs 2..3 blocks and rejects too many cards", () => {
    expect(() => groupLayout([3])).toThrow("BAD_GROUP_COUNT");
    expect(() => groupLayout([2, 2, 2, 2])).toThrow("BAD_GROUP_COUNT");
    expect(() => groupLayout([5, 5, 5, 0])).toThrow("BAD_GROUP_COUNT");
    expect(() => groupLayout([6, 2])).toThrow("BAD_GROUP_SIZE");
    expect(() => groupLayout([0, 2])).toThrow("BAD_GROUP_SIZE");
  });
});

describe("groupLayout geometry", () => {
  const CASES: number[][] = [[3, 3], [2, 2], [2, 2, 2], [3, 2], [1, 3], [5, 5], [5, 5, 5], [1, 1]];

  for (const counts of CASES) {
    it(`${counts.join("v")}: one rect per card, everything inside the frame`, () => {
      const { panels, cards } = groupLayout(counts);
      expect(panels).toHaveLength(counts.length);
      expect(cards.map((c) => c.length)).toEqual(counts);
      for (const p of panels) expect(inside(p)).toBe(true);
      for (const rect of cards.flat()) {
        expect(inside(rect)).toBe(true);
        expect(rect.y).toBeGreaterThanOrEqual(0.2 - 1e-9); // prompt strip stays free
      }
    });

    it(`${counts.join("v")}: cards are all the same size and never overlap`, () => {
      const { cards, cardW, cardH } = groupLayout(counts);
      const flat = cards.flat();
      for (const rect of flat) {
        expect(rect.w).toBeCloseTo(cardW, 12);
        expect(rect.h).toBeCloseTo(cardH, 12);
      }
      for (let i = 0; i < flat.length; i++)
        for (let j = i + 1; j < flat.length; j++)
          expect(overlaps(flat[i], flat[j])).toBe(false);
    });

    it(`${counts.join("v")}: panels do not overlap and keep the block order left to right`, () => {
      const { panels } = groupLayout(counts);
      for (let i = 1; i < panels.length; i++) {
        expect(panels[i].x).toBeGreaterThan(panels[i - 1].x + panels[i - 1].w);
      }
    });

    it(`${counts.join("v")}: every card sits inside its own panel`, () => {
      const { panels, cards } = groupLayout(counts);
      cards.forEach((group, gi) => {
        const p = panels[gi];
        for (const c of group) {
          expect(c.x).toBeGreaterThanOrEqual(p.x - 1e-9);
          expect(c.y).toBeGreaterThanOrEqual(p.y - 1e-9);
          expect(c.x + c.w).toBeLessThanOrEqual(p.x + p.w + 1e-9);
          expect(c.y + c.h).toBeLessThanOrEqual(p.y + p.h + 1e-9);
        }
      });
    });
  }

  it("landscape cards keep the 16:9 pixel aspect, portrait 2:3", () => {
    for (const r of groupLayout([3, 2]).cards.flat()) expect(pxAspect(r)).toBeCloseTo(16 / 9, 2);
    for (const r of groupLayout([3, 2], "portrait").cards.flat())
      expect(pxAspect(r)).toBeCloseTo(2 / 3, 2);
  });

  it("the whole composition is centered horizontally", () => {
    const { panels } = groupLayout([3, 2]);
    const left = panels[0].x;
    const right = 1 - (panels[panels.length - 1].x + panels[panels.length - 1].w);
    expect(left).toBeCloseTo(right, 6);
  });

  it("a narrower block gets a narrower panel, not bigger cards (3v2)", () => {
    const { panels, cardW } = groupLayout([3, 2]);
    expect(panels[0].w).toBeGreaterThan(panels[1].w);
    // the 3-block is exactly one card + gap wider
    expect(panels[0].w - panels[1].w).toBeCloseTo(cardW + 0.02, 6);
  });

  it("wraps big blocks into two rows when that makes the cards bigger (5v5)", () => {
    const flat = groupLayout([5, 5]).cards[0].map((r) => r.y);
    expect(new Set(flat.map((y) => y.toFixed(9))).size).toBe(2);
    // ...but a 2-card block stays a single row
    expect(new Set(groupLayout([2, 2]).cards[0].map((r) => r.y.toFixed(9))).size).toBe(1);
  });

  it("lays blocks of the same size out identically (no 1-row vs 2-rows twins)", () => {
    for (const orientation of ["landscape", "portrait"] as const) {
      for (const counts of [[4, 4], [5, 5], [3, 3], [2, 2, 2], [4, 4, 2]]) {
        const { panels, cards } = groupLayout(counts, orientation);
        const shape = (gi: number) => ({
          w: panels[gi].w.toFixed(9),
          rows: new Set(cards[gi].map((r) => r.y.toFixed(9))).size,
        });
        counts.forEach((count, gi) => {
          const twin = counts.findIndex((c) => c === count);
          expect(shape(gi), `${counts.join("v")} ${orientation} block ${gi}`).toEqual(shape(twin));
        });
      }
    }
  });

  it("gives 15 cards a usable size (three blocks of five)", () => {
    const { cardW, cards } = groupLayout([5, 5, 5]);
    expect(cards.flat()).toHaveLength(15);
    expect(cardW * 1920).toBeGreaterThan(140); // still > 140px wide in a 1920 frame
  });

  it("blocks are vertically aligned by their panel top", () => {
    const { panels } = groupLayout([5, 1]);
    expect(new Set(panels.map((p) => p.y.toFixed(9))).size).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { pickerLayout, rowSplit, MIN_TILES, MAX_TILES } from "./picker-layout";

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("rowSplit", () => {
  it("splits 5 as 3+2 and 7 as 4+3 (not flat lines)", () => {
    expect(rowSplit(5)).toEqual([3, 2]);
    expect(rowSplit(7)).toEqual([4, 3]);
    expect(rowSplit(9)).toEqual([3, 3, 3]);
  });

  it("rejects counts outside 2..9", () => {
    expect(() => rowSplit(1)).toThrow("BAD_TILE_COUNT");
    expect(() => rowSplit(10)).toThrow("BAD_TILE_COUNT");
  });
});

describe("pickerLayout", () => {
  it("returns one rect per tile for every supported count", () => {
    for (let n = MIN_TILES; n <= MAX_TILES; n++) {
      expect(pickerLayout(n)).toHaveLength(n);
    }
  });

  it("keeps every rect inside the frame and out of the prompt strip", () => {
    for (let n = MIN_TILES; n <= MAX_TILES; n++) {
      for (const r of pickerLayout(n)) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0.2 - 1e-9); // prompt strip is reserved
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("no two tiles overlap", () => {
    for (let n = MIN_TILES; n <= MAX_TILES; n++) {
      const rects = pickerLayout(n);
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
          expect(overlaps(rects[i], rects[j])).toBe(false);
    }
  });

  it("centers the short row of 5 tiles under the long one", () => {
    const rects = pickerLayout(5);
    const topRow = rects.slice(0, 3);
    const bottomRow = rects.slice(3);
    // same y within a row, bottom row lower
    expect(new Set(topRow.map((r) => r.y)).size).toBe(1);
    expect(bottomRow[0].y).toBeGreaterThan(topRow[0].y);
    // bottom row centered: its bounding box midpoint == top row midpoint
    const mid = (row: typeof rects) =>
      (row[0].x + row[row.length - 1].x + row[row.length - 1].w) / 2;
    expect(mid(bottomRow)).toBeCloseTo(mid(topRow), 10);
  });

  it("tiles are 16:9 in pixels (normalized w == h in a 16:9 frame)", () => {
    for (let n = MIN_TILES; n <= MAX_TILES; n++) {
      for (const r of pickerLayout(n)) expect(r.w).toBeCloseTo(r.h, 10);
    }
  });

  it("uses a uniform tile size within a layout", () => {
    for (let n = MIN_TILES; n <= MAX_TILES; n++) {
      const sizes = new Set(pickerLayout(n).map((r) => r.w.toFixed(12)));
      expect(sizes.size).toBe(1);
    }
  });
});

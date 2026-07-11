// Tile layouts for the picker mode: 2–9 tiles arranged in centered rows.
// All rects are normalized fractions of the 16:9 frame. Because both the
// frame and the tiles are 16:9, a tile's normalized width equals its
// normalized height, which keeps the math exact.

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_TILES = 2;
export const MAX_TILES = 9;

/** Row split per tile count: 5 -> 3+2 (centered), 7 -> 4+3, 9 -> 3x3, … */
export function rowSplit(count: number): number[] {
  switch (count) {
    case 2: return [2];
    case 3: return [3];
    case 4: return [2, 2];
    case 5: return [3, 2];
    case 6: return [3, 3];
    case 7: return [4, 3];
    case 8: return [4, 4];
    case 9: return [3, 3, 3];
    default:
      throw new Error("BAD_TILE_COUNT");
  }
}

// The strip above the tiles hosts the prompt; the bottom keeps a margin.
const ZONE_TOP = 0.2;
const ZONE_BOTTOM = 0.97;
const ZONE_LEFT = 0.03;
const ZONE_RIGHT = 0.97;
const GAP = 0.02; // between tiles, both axes

/**
 * Rects for `count` tiles in reading order (left-to-right, top-to-bottom).
 * Incomplete rows are horizontally centered; the grid is vertically centered
 * inside the tile zone.
 */
export function pickerLayout(count: number): TileRect[] {
  const rows = rowSplit(count);
  const maxCols = Math.max(...rows);
  const zoneW = ZONE_RIGHT - ZONE_LEFT;
  const zoneH = ZONE_BOTTOM - ZONE_TOP;

  // Normalized tile side (w == h for 16:9 tiles in a 16:9 frame).
  const s = Math.min(
    (zoneW - (maxCols - 1) * GAP) / maxCols,
    (zoneH - (rows.length - 1) * GAP) / rows.length,
  );

  const gridH = rows.length * s + (rows.length - 1) * GAP;
  const top = ZONE_TOP + (zoneH - gridH) / 2;

  const rects: TileRect[] = [];
  rows.forEach((cols, r) => {
    const rowW = cols * s + (cols - 1) * GAP;
    const left = ZONE_LEFT + (zoneW - rowW) / 2;
    for (let c = 0; c < cols; c++) {
      rects.push({ x: left + c * (s + GAP), y: top + r * (s + GAP), w: s, h: s });
    }
  });
  return rects;
}

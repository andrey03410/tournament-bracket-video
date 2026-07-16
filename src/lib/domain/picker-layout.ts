// Tile layouts for the picker mode: 2–9 tiles arranged in centered rows.
// All rects are normalized fractions of the 16:9 frame.

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TileOrientation = "landscape" | "portrait";

export const MIN_TILES = 2;
export const MAX_TILES = 9;

const FRAME_ASPECT = 16 / 9;
// Pixel aspect (w:h) of one tile. Landscape matches the frame; portrait is 2:3.
const TILE_ASPECT: Record<TileOrientation, number> = {
  landscape: 16 / 9,
  portrait: 2 / 3,
};

/** Row split per tile count, per orientation. */
export function rowSplit(count: number, orientation: TileOrientation = "landscape"): number[] {
  if (orientation === "portrait") {
    switch (count) {
      case 2: return [2];
      case 3: return [3];
      case 4: return [4];
      case 5: return [5];
      case 6: return [6];
      case 7: return [4, 3];
      case 8: return [4, 4];
      case 9: return [5, 4];
      default: throw new Error("BAD_TILE_COUNT");
    }
  }
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
 * inside the tile zone. Tile shape follows `orientation`.
 */
export function pickerLayout(
  count: number,
  orientation: TileOrientation = "landscape",
): TileRect[] {
  const rows = rowSplit(count, orientation);
  const maxCols = Math.max(...rows);
  const zoneW = ZONE_RIGHT - ZONE_LEFT;
  const zoneH = ZONE_BOTTOM - ZONE_TOP;

  // Normalized width:height ratio of a tile: k = tileAspect / frameAspect.
  // landscape -> 1 (w == h); portrait (2:3) -> 0.375 (tall).
  const k = TILE_ASPECT[orientation] / FRAME_ASPECT;

  // Pick the largest tile width w that fits both axes; height h = w / k.
  const w = Math.min(
    (zoneW - (maxCols - 1) * GAP) / maxCols,
    (k * (zoneH - (rows.length - 1) * GAP)) / rows.length,
  );
  const h = w / k;

  const gridH = rows.length * h + (rows.length - 1) * GAP;
  const top = ZONE_TOP + (zoneH - gridH) / 2;

  const rects: TileRect[] = [];
  rows.forEach((cols, r) => {
    const rowW = cols * w + (cols - 1) * GAP;
    const left = ZONE_LEFT + (zoneW - rowW) / 2;
    for (let c = 0; c < cols; c++) {
      rects.push({ x: left + c * (w + GAP), y: top + r * (h + GAP), w, h });
    }
  });
  return rects;
}

/** Effective orientation of a round: its own override, else the project default. */
export function effectiveOrientation(
  round: TileOrientation | null | undefined,
  project: TileOrientation | null | undefined,
): TileOrientation {
  return round ?? project ?? "landscape";
}

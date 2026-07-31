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

// ---- Group comparison (spec 16): 2-3 blocks of 1-5 cards, block against block ----

export const MIN_GROUPS = 2;
export const MAX_GROUPS = 3;
export const MAX_GROUP_TILES = 5;
export const MAX_GROUP_CARDS = 15;

const GROUP_GAP = 0.04; // between panels — also the room for the VS sign
const PANEL_PAD_X = 0.01;
const PANEL_PAD_Y = 0.015;
const PANEL_LABEL_H = 0.07; // strip above the cards, holds the block name

/**
 * Row splits a block of `count` cards may use. Blocks of 1-3 always stay one
 * row (a "тройка" must read as a row of three); 4 and 5 may wrap when two rows
 * make the cards bigger.
 */
export function groupSplits(count: number): number[][] {
  switch (count) {
    case 1: return [[1]];
    case 2: return [[2]];
    case 3: return [[3]];
    case 4: return [[4], [2, 2]];
    case 5: return [[5], [3, 2]];
    default: throw new Error("BAD_GROUP_SIZE");
  }
}

export interface GroupLayout {
  /** Uniform card size of the whole round. */
  cardW: number;
  cardH: number;
  /** Panel rect per block (label strip included), left to right. */
  panels: TileRect[];
  /** Card rects per block, in reading order inside the block. */
  cards: TileRect[][];
}

/**
 * Candidate per-block row splits. Blocks of the same card count always get the
 * same split — twins must look like twins, so the choice is made per distinct
 * count, not per block.
 */
function splitCombos(counts: number[]): number[][][] {
  const distinct = [...new Set(counts)];
  let byCount: Map<number, number[]>[] = [new Map()];
  for (const count of distinct) {
    byCount = byCount.flatMap((assigned) =>
      groupSplits(count).map((split) => new Map(assigned).set(count, split)),
    );
  }
  return byCount.map((assigned) => counts.map((count) => assigned.get(count)!));
}

/**
 * Blocks side by side, one card size for the whole round: the panel of a
 * smaller block is narrower instead of its cards being bigger, so no card ever
 * looks more important than another. Among the candidate row splits the one
 * with the largest card wins (ties: fewer rows).
 */
export function groupLayout(
  counts: number[],
  orientation: TileOrientation = "landscape",
): GroupLayout {
  if (counts.length < MIN_GROUPS || counts.length > MAX_GROUPS) throw new Error("BAD_GROUP_COUNT");
  if (counts.reduce((a, b) => a + b, 0) > MAX_GROUP_CARDS) throw new Error("BAD_GROUP_COUNT");

  const zoneW = ZONE_RIGHT - ZONE_LEFT;
  const zoneH = ZONE_BOTTOM - ZONE_TOP;
  const k = TILE_ASPECT[orientation] / FRAME_ASPECT;
  const gapCount = counts.length - 1;

  let best: { w: number; splits: number[][] } | null = null;
  for (const splits of splitCombos(counts)) {
    const cols = splits.map((rows) => Math.max(...rows));
    const maxRows = Math.max(...splits.map((rows) => rows.length));
    const fixedW =
      cols.reduce((sum, c) => sum + (c - 1) * GAP + 2 * PANEL_PAD_X, 0) + gapCount * GROUP_GAP;
    const byWidth = (zoneW - fixedW) / cols.reduce((a, b) => a + b, 0);
    const cardsH = zoneH - PANEL_LABEL_H - 2 * PANEL_PAD_Y - (maxRows - 1) * GAP;
    const byHeight = (k * cardsH) / maxRows;
    const w = Math.min(byWidth, byHeight);
    if (w <= 0) continue;
    const rowsTotal = splits.reduce((sum, rows) => sum + rows.length, 0);
    const bestRows = best?.splits.reduce((sum, rows) => sum + rows.length, 0) ?? Infinity;
    if (!best || w > best.w + 1e-12 || (Math.abs(w - best.w) <= 1e-12 && rowsTotal < bestRows)) {
      best = { w, splits };
    }
  }
  if (!best) throw new Error("NO_GROUP_FIT");

  const { w, splits } = best;
  const h = w / k;
  const cols = splits.map((rows) => Math.max(...rows));
  const maxRows = Math.max(...splits.map((rows) => rows.length));
  // All panels share one height (the tallest block defines it) so the row of
  // blocks reads as one composition.
  const panelH = PANEL_LABEL_H + 2 * PANEL_PAD_Y + maxRows * h + (maxRows - 1) * GAP;
  const panelWs = cols.map((c) => c * w + (c - 1) * GAP + 2 * PANEL_PAD_X);
  const totalW = panelWs.reduce((a, b) => a + b, 0) + gapCount * GROUP_GAP;

  let x = ZONE_LEFT + (zoneW - totalW) / 2;
  const panelY = ZONE_TOP + (zoneH - panelH) / 2;

  const panels: TileRect[] = [];
  const cards: TileRect[][] = [];
  splits.forEach((rows, gi) => {
    const panelW = panelWs[gi];
    panels.push({ x, y: panelY, w: panelW, h: panelH });

    const gridH = rows.length * h + (rows.length - 1) * GAP;
    const areaTop = panelY + PANEL_LABEL_H + PANEL_PAD_Y;
    const areaH = panelH - PANEL_LABEL_H - 2 * PANEL_PAD_Y;
    const top = areaTop + (areaH - gridH) / 2;

    const group: TileRect[] = [];
    rows.forEach((rowCols, r) => {
      const rowW = rowCols * w + (rowCols - 1) * GAP;
      const left = x + (panelW - rowW) / 2;
      for (let c = 0; c < rowCols; c++) {
        group.push({ x: left + c * (w + GAP), y: top + r * (h + GAP), w, h });
      }
    });
    cards.push(group);
    x += panelW + GROUP_GAP;
  });

  return { cardW: w, cardH: h, panels, cards };
}

/** Effective orientation of a round: its own override, else the project default. */
export function effectiveOrientation(
  round: TileOrientation | null | undefined,
  project: TileOrientation | null | undefined,
): TileOrientation {
  return round ?? project ?? "landscape";
}

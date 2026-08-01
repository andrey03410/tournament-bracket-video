import type { Comparison } from "./types";

/**
 * How much of the final order the comparison log actually pins down.
 *
 * Points alone hide this: a Swiss run can spend 800 comparisons and still leave
 * 55 tracks on the same score, ordered by nothing but upload order. Walking the
 * transitive closure answers the honest question — for how many pairs do we know
 * who is above whom?
 *
 * Draws are not edges: "equal" is not an order. Real preferences are not
 * transitive either (a measured 28% of tracks in one real tournament sit inside
 * cycles), so pairs reachable in both directions are reported separately instead
 * of being silently resolved one way.
 */
export interface Coverage {
  /** Total pairs in the tournament, n*(n-1)/2. */
  pairs: number;
  /** Pairs whose order follows from the log. */
  ordered: number;
  /** `ordered` as a percentage, one decimal. 100 when there is nothing to order. */
  orderedPct: number;
  /** Pairs reachable both ways — the log disagrees with itself about them. */
  contradictory: number;
  /** Tracks that lie on at least one preference cycle. */
  itemsInCycles: number;
}

export function orderCoverage(items: string[], comparisons: Comparison[]): Coverage {
  const n = items.length;
  const pairs = (n * (n - 1)) / 2;
  if (n <= 1) {
    return { pairs: 0, ordered: 0, orderedPct: 100, contradictory: 0, itemsInCycles: 0 };
  }

  const index = new Map(items.map((id, i) => [id, i]));
  const words = Math.ceil(n / 32);
  // reach[i] = bitset of items i is known to be better than
  const reach = Array.from({ length: n }, () => new Uint32Array(words));
  const setBit = (row: Uint32Array, j: number) => {
    row[j >>> 5] |= 1 << (j & 31);
  };
  const hasBit = (row: Uint32Array, j: number) => (row[j >>> 5] & (1 << (j & 31))) !== 0;

  for (const c of comparisons) {
    if (c.result === "draw") continue;
    const i = index.get(c.a);
    const j = index.get(c.b);
    if (i === undefined || j === undefined) continue;
    if (c.result === "a") setBit(reach[i], j);
    else setBit(reach[j], i);
  }

  // Transitive closure, bitset Warshall: O(n^3 / 32).
  for (let k = 0; k < n; k++) {
    const rowK = reach[k];
    for (let i = 0; i < n; i++) {
      if (!hasBit(reach[i], k)) continue;
      const rowI = reach[i];
      for (let w = 0; w < words; w++) rowI[w] |= rowK[w];
    }
  }

  let ordered = 0;
  let contradictory = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ij = hasBit(reach[i], j);
      const ji = hasBit(reach[j], i);
      if (ij && ji) contradictory++;
      else if (ij || ji) ordered++;
    }
  }

  let itemsInCycles = 0;
  for (let i = 0; i < n; i++) if (hasBit(reach[i], i)) itemsInCycles++;

  return {
    pairs,
    ordered,
    orderedPct: pairs === 0 ? 100 : Math.round((ordered / pairs) * 1000) / 10,
    contradictory,
    itemsInCycles,
  };
}

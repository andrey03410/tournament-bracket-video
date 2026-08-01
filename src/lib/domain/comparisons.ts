import type { Comparison, ComparisonResult, RankedItem } from "./types";

/** Unordered key for a pair, so (a,b) and (b,a) map to the same comparison. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Look up a recorded result oriented to the queried order (a, b).
 * Returns the result as if the question was "a vs b", flipping if it was stored
 * as "b vs a". `undefined` means the pair has not been compared yet.
 */
export function lookup(
  comparisons: Comparison[],
  a: string,
  b: string,
): ComparisonResult | undefined {
  for (const c of comparisons) {
    if (c.a === a && c.b === b) return c.result;
    if (c.a === b && c.b === a) {
      if (c.result === "draw") return "draw";
      return c.result === "a" ? "b" : "a";
    }
  }
  return undefined;
}

/** Unordered keys of every pair the log has an answer for. */
export function playedPairs(comparisons: Comparison[]): Set<string> {
  const played = new Set<string>();
  for (const c of comparisons) played.add(pairKey(c.a, c.b));
  return played;
}

/**
 * How many *distinct* opponents each item has faced. Distinct, not rows: a
 * rematch must not look like progress, and group answers write one row per pair.
 */
export function opponentCounts(
  items: string[],
  comparisons: Comparison[],
): Map<string, number> {
  const known = new Set(items);
  const seen = new Map<string, Set<string>>(items.map((id) => [id, new Set()]));
  for (const c of comparisons) {
    if (!known.has(c.a) || !known.has(c.b) || c.a === c.b) continue;
    seen.get(c.a)!.add(c.b);
    seen.get(c.b)!.add(c.a);
  }
  return new Map([...seen].map(([id, opponents]) => [id, opponents.size]));
}

export class NeedComparison extends Error {
  constructor(
    public a: string,
    public b: string,
  ) {
    super(`comparison needed: ${a} vs ${b}`);
    this.name = "NeedComparison";
  }
}

/**
 * Comparator usable inside sort algorithms. Consults the log; if the pair is
 * unknown it throws NeedComparison so the caller can surface the next question.
 * Returns <0 if a ranks above b, >0 if b above a, 0 for a draw.
 */
export function makeComparator(comparisons: Comparison[]) {
  return (a: string, b: string): number => {
    const res = lookup(comparisons, a, b);
    if (res === undefined) throw new NeedComparison(a, b);
    if (res === "a") return -1;
    if (res === "b") return 1;
    return 0;
  };
}

/** Win/draw/loss points from the comparison log. win=1, draw=0.5, loss=0. */
export function computeScores(
  items: string[],
  comparisons: Comparison[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const id of items) scores.set(id, 0);
  for (const c of comparisons) {
    if (!scores.has(c.a) || !scores.has(c.b)) continue;
    if (c.result === "a") scores.set(c.a, (scores.get(c.a) ?? 0) + 1);
    else if (c.result === "b") scores.set(c.b, (scores.get(c.b) ?? 0) + 1);
    else {
      scores.set(c.a, (scores.get(c.a) ?? 0) + 0.5);
      scores.set(c.b, (scores.get(c.b) ?? 0) + 0.5);
    }
  }
  return scores;
}

export function winCount(
  items: string[],
  comparisons: Comparison[],
): Map<string, number> {
  const wins = new Map<string, number>();
  for (const id of items) wins.set(id, 0);
  for (const c of comparisons) {
    if (c.result === "a" && wins.has(c.a)) wins.set(c.a, (wins.get(c.a) ?? 0) + 1);
    if (c.result === "b" && wins.has(c.b)) wins.set(c.b, (wins.get(c.b) ?? 0) + 1);
  }
  return wins;
}

/**
 * Rank items by points, breaking ties strictly (spec: "ties allowed, no shared
 * places"). Tiebreak order: points -> head-to-head -> wins -> original order.
 * `items` must be in original (upload) order.
 */
export function rankByScore(
  items: string[],
  comparisons: Comparison[],
): RankedItem[] {
  const scores = computeScores(items, comparisons);
  const wins = winCount(items, comparisons);
  const originalIndex = new Map(items.map((id, i) => [id, i]));

  const sorted = [...items].sort((a, b) => {
    const sa = scores.get(a) ?? 0;
    const sb = scores.get(b) ?? 0;
    if (sa !== sb) return sb - sa; // higher points first

    // head-to-head
    const h2h = lookup(comparisons, a, b);
    if (h2h === "a") return -1;
    if (h2h === "b") return 1;

    const wa = wins.get(a) ?? 0;
    const wb = wins.get(b) ?? 0;
    if (wa !== wb) return wb - wa;

    return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  });

  return sorted.map((id, i) => ({
    id,
    rank: i + 1,
    score: scores.get(id) ?? 0,
  }));
}

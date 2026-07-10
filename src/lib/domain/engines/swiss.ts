import type { Comparison, Pair, Progress, RankedItem } from "../types";
import { lookup, pairKey, rankByScore } from "../comparisons";
import type { Engine } from "./index";

/** Number of Swiss rounds for n players: ceil(log2 n), at least 1. */
export function swissRounds(n: number): number {
  if (n <= 1) return 0;
  return Math.max(1, Math.ceil(Math.log2(n)));
}

/**
 * Pair a points-sorted list adjacently, preferring opponents not yet played.
 * Falls back to a rematch if no fresh opponent remains. An odd one out gets a bye
 * (no game that round). Mutates `played` with the pairings it produces.
 */
function pairRound(order: string[], played: Set<string>): Pair[] {
  const used = new Set<string>();
  const pairs: Pair[] = [];
  for (let i = 0; i < order.length; i++) {
    const x = order[i];
    if (used.has(x)) continue;
    let partner = -1;
    for (let j = i + 1; j < order.length; j++) {
      if (!used.has(order[j]) && !played.has(pairKey(x, order[j]))) {
        partner = j;
        break;
      }
    }
    if (partner === -1) {
      for (let j = i + 1; j < order.length; j++) {
        if (!used.has(order[j])) {
          partner = j;
          break;
        }
      }
    }
    if (partner === -1) {
      used.add(x); // bye
      continue;
    }
    const y = order[partner];
    used.add(x);
    used.add(y);
    pairs.push({ a: x, b: y });
    played.add(pairKey(x, y));
  }
  return pairs;
}

/**
 * Simulate rounds in order. Standings used to pair round r reflect only the
 * results of rounds < r (we stop as soon as we hit an unanswered pairing).
 * Returns the first unanswered pair, or null if all rounds are complete.
 */
function findNext(items: string[], comparisons: Comparison[]): Pair | null {
  const rounds = swissRounds(items.length);
  const points = new Map<string, number>(items.map((id) => [id, 0]));
  const originalIndex = new Map(items.map((id, i) => [id, i]));
  const played = new Set<string>();

  for (let r = 0; r < rounds; r++) {
    const order = [...items].sort((a, b) => {
      const pa = points.get(a) ?? 0;
      const pb = points.get(b) ?? 0;
      if (pa !== pb) return pb - pa;
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    });
    const pairs = pairRound(order, played);
    for (const pair of pairs) {
      const res = lookup(comparisons, pair.a, pair.b);
      if (res === undefined) return pair; // first unanswered pairing
      if (res === "a") points.set(pair.a, (points.get(pair.a) ?? 0) + 1);
      else if (res === "b") points.set(pair.b, (points.get(pair.b) ?? 0) + 1);
      else {
        points.set(pair.a, (points.get(pair.a) ?? 0) + 0.5);
        points.set(pair.b, (points.get(pair.b) ?? 0) + 0.5);
      }
    }
  }
  return null;
}

export const swissEngine: Engine = {
  scheme: "swiss",

  nextPair(items, comparisons): Pair | null {
    return findNext(items, comparisons);
  },

  isComplete(items, comparisons): boolean {
    return findNext(items, comparisons) === null;
  },

  ranking(items, comparisons): RankedItem[] {
    return rankByScore(items, comparisons);
  },

  progress(items, comparisons): Progress {
    const n = items.length;
    return {
      completed: comparisons.length,
      estimatedTotal: swissRounds(n) * Math.floor(n / 2),
    };
  },

  // Points-based standings are meaningful at any point.
  partialRanking(items, comparisons): RankedItem[] {
    return rankByScore(items, comparisons);
  },
};

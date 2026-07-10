import type { Comparison, Pair, Progress, RankedItem } from "../types";
import { lookup, rankByScore } from "../comparisons";
import type { Engine } from "./index";

/** Every item vs every other. Accurate but O(N^2) comparisons. */
export const roundRobinEngine: Engine = {
  scheme: "round_robin",

  nextPair(items, comparisons): Pair | null {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (lookup(comparisons, items[i], items[j]) === undefined) {
          return { a: items[i], b: items[j] };
        }
      }
    }
    return null;
  },

  isComplete(items, comparisons): boolean {
    return this.nextPair(items, comparisons) === null;
  },

  ranking(items, comparisons): RankedItem[] {
    return rankByScore(items, comparisons);
  },

  progress(items, comparisons): Progress {
    const n = items.length;
    return {
      completed: comparisons.length,
      estimatedTotal: (n * (n - 1)) / 2,
    };
  },

  // Points-based standings are meaningful at any point.
  partialRanking(items, comparisons): RankedItem[] {
    return rankByScore(items, comparisons);
  },
};

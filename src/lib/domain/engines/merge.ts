import type { Comparison, Pair, Progress, RankedItem } from "../types";
import { computeScores, makeComparator, NeedComparison } from "../comparisons";
import type { Engine } from "./index";

/**
 * Comparison sort (stable merge sort) that asks the user only the comparisons it
 * needs (~N·log N). Draws are treated as "equal" (comparator returns 0); stable
 * merge keeps original order, so the result is still a strict ordering.
 *
 * Resumability: running the same merge sort against the same comparison log is
 * deterministic, so re-running it reproduces the exact next question.
 */
function mergeSortOrder(ids: string[], cmp: (a: string, b: string) => number): string[] {
  if (ids.length <= 1) return ids;
  const mid = Math.floor(ids.length / 2);
  const left = mergeSortOrder(ids.slice(0, mid), cmp);
  const right = mergeSortOrder(ids.slice(mid), cmp);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // <= 0 keeps left first on a draw (stable)
    if (cmp(left[i], right[j]) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

/**
 * Worst-case number of comparisons a merge sort performs on n items:
 *   n·⌈log₂ n⌉ − 2^⌈log₂ n⌉ + 1
 * Actual runs use this many or fewer, so it's a safe upper bound for the progress
 * bar (never exceeds 100%) and far tighter than the naive n·log₂ n.
 */
export function mergeWorstCaseComparisons(n: number): number {
  if (n <= 1) return 0;
  const k = Math.ceil(Math.log2(n));
  return n * k - 2 ** k + 1;
}

export const mergeEngine: Engine = {
  scheme: "merge",

  nextPair(items, comparisons): Pair | null {
    const cmp = makeComparator(comparisons);
    try {
      mergeSortOrder(items, cmp);
      return null; // completed without needing a new comparison
    } catch (e) {
      if (e instanceof NeedComparison) return { a: e.a, b: e.b };
      throw e;
    }
  },

  isComplete(items, comparisons): boolean {
    return this.nextPair(items, comparisons) === null;
  },

  ranking(items, comparisons): RankedItem[] {
    const cmp = makeComparator(comparisons);
    const order = mergeSortOrder(items, cmp); // throws if incomplete — guard with isComplete
    const scores = computeScores(items, comparisons);
    return order.map((id, i) => ({ id, rank: i + 1, score: scores.get(id) ?? 0 }));
  },

  progress(items, comparisons): Progress {
    return {
      completed: comparisons.length,
      estimatedTotal: mergeWorstCaseComparisons(items.length),
    };
  },

  // Merge sort has no meaningful intermediate ranking until it finishes.
  partialRanking() {
    return null;
  },
};

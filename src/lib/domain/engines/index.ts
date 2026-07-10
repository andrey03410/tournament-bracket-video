import type { Comparison, Pair, Progress, RankedItem, Scheme } from "../types";
import { mergeEngine } from "./merge";
import { swissEngine } from "./swiss";
import { roundRobinEngine } from "./round-robin";

/**
 * A tournament engine decides which pairs to ask and how to rank the result.
 * Engines are PURE and RESUMABLE: every method derives its answer solely from the
 * item list plus the recorded comparison log, so a paused tournament resumes by
 * replaying the log — no hidden state to persist.
 *
 * `items` must always be passed in original (upload) order, used for tiebreaks.
 */
export interface Engine {
  scheme: Scheme;
  /** Next pair to compare, or null when the tournament is complete. */
  nextPair(items: string[], comparisons: Comparison[]): Pair | null;
  isComplete(items: string[], comparisons: Comparison[]): boolean;
  /** Final ranking, best -> worst. Valid once isComplete() is true. */
  ranking(items: string[], comparisons: Comparison[]): RankedItem[];
  progress(items: string[], comparisons: Comparison[]): Progress;
  /**
   * Provisional standings mid-tournament, or null if the scheme has no meaningful
   * intermediate ranking (e.g. comparison sort). Used to show a live preliminary top.
   */
  partialRanking(items: string[], comparisons: Comparison[]): RankedItem[] | null;
}

export function createEngine(scheme: Scheme): Engine {
  switch (scheme) {
    case "merge":
      return mergeEngine;
    case "swiss":
      return swissEngine;
    case "round_robin":
      return roundRobinEngine;
  }
}

export { mergeEngine, swissEngine, roundRobinEngine };

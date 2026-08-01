import { describe, it, expect } from "vitest";
import {
  lookup,
  pairKey,
  computeScores,
  winCount,
  rankByScore,
  playedPairs,
  opponentCounts,
} from "./comparisons";
import type { Comparison } from "./types";

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
});

describe("lookup", () => {
  const log: Comparison[] = [{ a: "x", b: "y", result: "a" }];

  it("returns the result in queried orientation", () => {
    expect(lookup(log, "x", "y")).toBe("a");
  });

  it("flips the result when stored in reverse order", () => {
    expect(lookup(log, "y", "x")).toBe("b");
  });

  it("keeps draws as draws regardless of orientation", () => {
    const d: Comparison[] = [{ a: "x", b: "y", result: "draw" }];
    expect(lookup(d, "x", "y")).toBe("draw");
    expect(lookup(d, "y", "x")).toBe("draw");
  });

  it("returns undefined for uncompared pairs", () => {
    expect(lookup(log, "x", "z")).toBeUndefined();
  });
});

describe("computeScores / winCount", () => {
  const items = ["a", "b", "c"];
  const log: Comparison[] = [
    { a: "a", b: "b", result: "a" }, // a wins
    { a: "a", b: "c", result: "draw" }, // a/c split
    { a: "b", b: "c", result: "b" }, // c wins
  ];

  it("awards 1 / 0.5 / 0 points", () => {
    const s = computeScores(items, log);
    expect(s.get("a")).toBe(1.5); // win + draw
    expect(s.get("b")).toBe(0);
    expect(s.get("c")).toBe(1.5); // draw + win
  });

  it("counts only decisive wins", () => {
    const w = winCount(items, log);
    expect(w.get("a")).toBe(1);
    expect(w.get("c")).toBe(1);
    expect(w.get("b")).toBe(0);
  });
});

describe("rankByScore", () => {
  it("orders by points and produces strict 1-based ranks", () => {
    const items = ["a", "b", "c"];
    const log: Comparison[] = [
      { a: "a", b: "b", result: "a" },
      { a: "a", b: "c", result: "a" },
      { a: "b", b: "c", result: "a" },
    ];
    const r = rankByScore(items, log);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it("breaks equal points by head-to-head", () => {
    // a and b both beat c, but b beat a -> b ranks above a
    const items = ["a", "b", "c"];
    const log: Comparison[] = [
      { a: "a", b: "c", result: "a" },
      { a: "b", b: "c", result: "a" },
      { a: "a", b: "b", result: "b" }, // b beats a
    ];
    const r = rankByScore(items, log);
    expect(r[0].id).toBe("b");
    expect(r[1].id).toBe("a");
  });

  it("falls back to original order for fully equal items", () => {
    const items = ["a", "b"];
    const r = rankByScore(items, []);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2]);
  });
});

describe("playedPairs", () => {
  it("keys a pair the same way whichever side was asked first", () => {
    const played = playedPairs([{ a: "b", b: "a", result: "b" }]);
    expect(played.has(pairKey("a", "b"))).toBe(true);
    expect(played.size).toBe(1);
  });

  it("counts a draw as played — it is an answer, not a gap", () => {
    expect(playedPairs([{ a: "a", b: "b", result: "draw" }]).size).toBe(1);
  });
});

describe("opponentCounts", () => {
  const items = ["a", "b", "c"];

  it("counts distinct opponents, not rows", () => {
    const log: Comparison[] = [
      { a: "a", b: "b", result: "a" },
      { a: "a", b: "b", result: "b" }, // a rematch must not look like progress
      { a: "a", b: "c", result: "a" },
    ];
    const counts = opponentCounts(items, log);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBe(1);
  });

  it("starts everyone at zero and ignores unknown tracks", () => {
    const counts = opponentCounts(items, [{ a: "a", b: "zzz", result: "a" }]);
    expect([...counts.values()]).toEqual([0, 0, 0]);
  });
});

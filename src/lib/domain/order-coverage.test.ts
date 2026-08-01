import { describe, it, expect } from "vitest";
import { orderCoverage } from "./order-coverage";
import type { Comparison } from "./types";

const items = ["a", "b", "c"];

describe("orderCoverage", () => {
  it("counts nothing as determined on an empty log", () => {
    const c = orderCoverage(items, []);
    expect(c.pairs).toBe(3);
    expect(c.ordered).toBe(0);
    expect(c.orderedPct).toBe(0);
    expect(c.contradictory).toBe(0);
    expect(c.itemsInCycles).toBe(0);
  });

  it("counts a direct answer", () => {
    const c = orderCoverage(items, [{ a: "a", b: "b", result: "a" }]);
    expect(c.ordered).toBe(1);
  });

  it("follows transitivity: a>b and b>c also settle a vs c", () => {
    const log: Comparison[] = [
      { a: "a", b: "b", result: "a" },
      { a: "b", b: "c", result: "a" },
    ];
    const c = orderCoverage(items, log);
    expect(c.ordered).toBe(3);
    expect(c.orderedPct).toBe(100);
  });

  it("reads a result recorded in the other direction", () => {
    const c = orderCoverage(items, [{ a: "b", b: "a", result: "b" }]);
    expect(c.ordered).toBe(1);
  });

  it("does not treat a draw as an order", () => {
    const c = orderCoverage(items, [{ a: "a", b: "b", result: "draw" }]);
    expect(c.ordered).toBe(0);
  });

  it("reports a cycle instead of pretending it is an order", () => {
    const log: Comparison[] = [
      { a: "a", b: "b", result: "a" },
      { a: "b", b: "c", result: "a" },
      { a: "c", b: "a", result: "a" },
    ];
    const c = orderCoverage(items, log);
    expect(c.contradictory).toBe(3);
    expect(c.ordered).toBe(0);
    expect(c.itemsInCycles).toBe(3);
  });

  it("keeps a cycle from poisoning the pairs outside it", () => {
    const four = ["a", "b", "c", "d"];
    const log: Comparison[] = [
      { a: "a", b: "b", result: "a" },
      { a: "b", b: "c", result: "a" },
      { a: "c", b: "a", result: "a" }, // a,b,c form a cycle
      { a: "a", b: "d", result: "a" }, // everyone in the cycle beats d
    ];
    const c = orderCoverage(four, log);
    expect(c.contradictory).toBe(3);
    expect(c.itemsInCycles).toBe(3);
    expect(c.ordered).toBe(3); // a>d, b>d, c>d
  });

  it("ignores comparisons about tracks that are not in the list", () => {
    const c = orderCoverage(items, [{ a: "a", b: "zzz", result: "a" }]);
    expect(c.ordered).toBe(0);
  });

  it("calls a one-track tournament fully determined", () => {
    const c = orderCoverage(["only"], []);
    expect(c.pairs).toBe(0);
    expect(c.orderedPct).toBe(100);
  });

  it("survives a wide field without blowing up", () => {
    // 300 tracks in one long chain: every pair is settled by transitivity
    const wide = Array.from({ length: 300 }, (_, i) => `i${i}`);
    const log: Comparison[] = wide.slice(0, -1).map((id, i) => ({
      a: id,
      b: wide[i + 1],
      result: "a" as const,
    }));
    const c = orderCoverage(wide, log);
    expect(c.pairs).toBe((300 * 299) / 2);
    expect(c.ordered).toBe(c.pairs);
    expect(c.orderedPct).toBe(100);
  });
});

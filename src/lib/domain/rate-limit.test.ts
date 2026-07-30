import { describe, it, expect } from "vitest";
import { nextDelayMs, retryDelayMs, trimHistory } from "./rate-limit";

// Shikimori's real caps: 5 rps and 90 rpm (we keep a margin).
const CFG = { minIntervalMs: 250, windowMs: 60_000, maxInWindow: 3 };

describe("nextDelayMs", () => {
  it("lets the first request through immediately", () => {
    expect(nextDelayMs([], 1_000, CFG)).toBe(0);
  });

  it("keeps the per-second gap after the previous request", () => {
    expect(nextDelayMs([1_000], 1_100, CFG)).toBe(150);
    expect(nextDelayMs([1_000], 1_250, CFG)).toBe(0);
    expect(nextDelayMs([1_000], 5_000, CFG)).toBe(0);
  });

  it("holds the request until the full window frees a slot", () => {
    const history = [10_000, 10_500, 11_000]; // window is full (3 in 60s)
    // waiting for the oldest to age out of the 60s window
    expect(nextDelayMs(history, 20_000, CFG)).toBe(50_000);
    expect(nextDelayMs(history, 69_000, CFG)).toBe(1_000);
    expect(nextDelayMs(history, 70_001, CFG)).toBe(0);
  });

  it("counts only requests still inside the window", () => {
    // the first two are older than 60s -> only one counts, so just the gap
    const history = [1_000, 2_000, 70_000];
    expect(nextDelayMs(history, 70_100, CFG)).toBe(150);
    expect(nextDelayMs(history, 80_000, CFG)).toBe(0);
  });

  it("takes the larger of the two waits", () => {
    const history = [10_000, 10_100, 69_990];
    // gap wants 240ms, the window wants ~10ms -> gap wins
    expect(nextDelayMs(history, 69_990 + 10, CFG)).toBe(240);
  });

  it("a window of one request degenerates to a plain gap", () => {
    const single = { minIntervalMs: 250, windowMs: 1, maxInWindow: 1 };
    expect(nextDelayMs([1_000], 1_100, single)).toBe(150);
    expect(nextDelayMs([1_000], 1_300, single)).toBe(0);
  });
});

describe("trimHistory", () => {
  it("drops timestamps outside the window", () => {
    // at 70_500 only entries newer than 10_500 stay inside the 60s window
    expect(trimHistory([1_000, 2_000, 70_000], 70_500, CFG)).toEqual([70_000]);
    expect(trimHistory([1_000, 2_000, 70_000], 61_000, CFG)).toEqual([2_000, 70_000]);
    expect(trimHistory([], 0, CFG)).toEqual([]);
  });
});

describe("retryDelayMs", () => {
  const schedule = [2_000, 8_000, 20_000];

  it("follows the schedule and then gives up", () => {
    expect(retryDelayMs(0, schedule)).toBe(2_000);
    expect(retryDelayMs(2, schedule)).toBe(20_000);
    expect(retryDelayMs(3, schedule)).toBeNull();
  });

  it("prefers a sane Retry-After from the server", () => {
    expect(retryDelayMs(0, schedule, "5")).toBe(5_000);
    expect(retryDelayMs(0, schedule, "0")).toBe(2_000); // бессмысленный -> расписание
    expect(retryDelayMs(0, schedule, "999")).toBe(2_000); // абсурдный -> расписание
    expect(retryDelayMs(0, schedule, "soon")).toBe(2_000);
    expect(retryDelayMs(0, schedule, null)).toBe(2_000);
  });

  it("an exhausted budget stays exhausted even with Retry-After", () => {
    expect(retryDelayMs(3, schedule, "5")).toBeNull();
  });
});

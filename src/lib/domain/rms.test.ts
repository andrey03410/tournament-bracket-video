import { describe, it, expect } from "vitest";
import { selectActiveSnippet } from "./rms";

describe("selectActiveSnippet", () => {
  it("returns the whole track when shorter than the window", () => {
    const samples = new Float32Array(100).fill(0.5);
    const snip = selectActiveSnippet(samples, 100, 5); // want 5s but only 1s exists
    expect(snip.startSec).toBe(0);
    expect(snip.endSec).toBeCloseTo(1, 5);
  });

  it("locates the loudest window", () => {
    const sampleRate = 10;
    // 10s: quiet, then a loud burst at seconds 4..6
    const samples = new Float32Array(100).fill(0.01);
    for (let i = 40; i < 60; i++) samples[i] = 1.0;
    const snip = selectActiveSnippet(samples, sampleRate, 2); // 2s window = 20 samples
    expect(snip.startSec).toBeGreaterThanOrEqual(3.9);
    expect(snip.startSec).toBeLessThanOrEqual(4.1);
    expect(snip.endSec - snip.startSec).toBeCloseTo(2, 5);
  });

  it("handles empty input", () => {
    expect(selectActiveSnippet(new Float32Array(0), 44100, 5)).toEqual({
      startSec: 0,
      endSec: 0,
    });
  });

  it("prefers a sustained-energy window over isolated spikes", () => {
    const sampleRate = 10;
    const samples = new Float32Array(100).fill(0.0);
    // single huge spike at t=1s
    samples[10] = 5.0;
    // sustained moderate energy at 5..8s
    for (let i = 50; i < 80; i++) samples[i] = 1.0;
    const snip = selectActiveSnippet(samples, sampleRate, 3); // 3s = 30 samples
    // the sustained 3s region (30 * 1.0^2 = 30) beats the spike window (~25)
    expect(snip.startSec).toBeGreaterThanOrEqual(4.9);
  });
});

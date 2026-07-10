import { describe, expect, it } from "vitest";
import {
  mediaAudioAvailable,
  parseAudioSource,
  parseMediaStartSec,
  resolveFootage,
  resolveVisualSource,
  type PoolMediaInfo,
} from "./position-media";

const image: PoolMediaInfo = { kind: "image", durationSec: null, hasAudio: false };
const video: PoolMediaInfo = { kind: "video", durationSec: 20, hasAudio: true };
const muteVideo: PoolMediaInfo = { kind: "video", durationSec: 20, hasAudio: false };

describe("resolveVisualSource", () => {
  it("attached media wins for both track kinds", () => {
    expect(resolveVisualSource("audio", image)).toEqual({ source: "media", kind: "image" });
    expect(resolveVisualSource("video", image)).toEqual({ source: "media", kind: "image" });
    expect(resolveVisualSource("audio", video)).toEqual({ source: "media", kind: "video" });
  });

  it("video track falls back to its own footage", () => {
    expect(resolveVisualSource("video", null)).toEqual({ source: "track", kind: "video" });
  });

  it("audio track without media -> placeholder", () => {
    expect(resolveVisualSource("audio", null)).toEqual({ source: "none" });
  });
});

describe("parseAudioSource", () => {
  it("accepts track always, media only for a video with audio", () => {
    expect(parseAudioSource("track", null)).toEqual({ ok: true, audioSource: "track" });
    expect(parseAudioSource("media", video)).toEqual({ ok: true, audioSource: "media" });
  });

  it("rejects media audio for images, soundless videos and empty positions", () => {
    for (const media of [image, muteVideo, null]) {
      expect(parseAudioSource("media", media)).toEqual({
        ok: false,
        error: "NO_MEDIA_AUDIO",
      });
    }
  });

  it("rejects unknown values", () => {
    for (const bad of ["both", 1, null, undefined, {}]) {
      expect(parseAudioSource(bad, video).ok).toBe(false);
    }
  });

  it("mediaAudioAvailable mirrors the rule", () => {
    expect(mediaAudioAvailable(video)).toBe(true);
    expect(mediaAudioAvailable(muteVideo)).toBe(false);
    expect(mediaAudioAvailable(image)).toBe(false);
    expect(mediaAudioAvailable(null)).toBe(false);
  });
});

describe("parseMediaStartSec", () => {
  it("null resets, valid offsets pass", () => {
    expect(parseMediaStartSec(null)).toEqual({ ok: true, value: null });
    expect(parseMediaStartSec(0, 20)).toEqual({ ok: true, value: 0 });
    expect(parseMediaStartSec(12.5, 20)).toEqual({ ok: true, value: 12.5 });
    expect(parseMediaStartSec(5, null)).toEqual({ ok: true, value: 5 });
    expect(parseMediaStartSec(5)).toEqual({ ok: true, value: 5 });
  });

  it("rejects garbage, negatives and offsets past the footage end", () => {
    for (const bad of [-1, NaN, Infinity, "5", {}, undefined]) {
      expect(parseMediaStartSec(bad, 20).ok).toBe(false);
    }
    expect(parseMediaStartSec(20, 20).ok).toBe(false);
    expect(parseMediaStartSec(25, 20).ok).toBe(false);
  });
});

describe("resolveFootage", () => {
  it("footage covers the segment -> play straight from the offset", () => {
    expect(resolveFootage(0, 60, 30)).toEqual({ startSec: 0, loopSec: null });
    expect(resolveFootage(10, 60, 30)).toEqual({ startSec: 10, loopSec: null });
  });

  it("exactly matching length does not loop", () => {
    expect(resolveFootage(0, 30, 30)).toEqual({ startSec: 0, loopSec: null });
    expect(resolveFootage(10, 40, 30)).toEqual({ startSec: 10, loopSec: null });
  });

  it("short footage loops over what is available", () => {
    expect(resolveFootage(0, 20, 30)).toEqual({ startSec: 0, loopSec: 20 });
    expect(resolveFootage(5, 20, 30)).toEqual({ startSec: 5, loopSec: 15 });
  });

  it("unknown footage length -> play straight (pipeline probes later)", () => {
    expect(resolveFootage(7, null, 30)).toEqual({ startSec: 7, loopSec: null });
  });

  it("stale offset past the footage end falls back to the whole footage", () => {
    expect(resolveFootage(25, 20, 30)).toEqual({ startSec: 0, loopSec: 20 });
    expect(resolveFootage(25, 20, 10)).toEqual({ startSec: 0, loopSec: null });
  });

  it("negative offset is clamped to 0", () => {
    expect(resolveFootage(-5, 60, 30)).toEqual({ startSec: 0, loopSec: null });
  });
});

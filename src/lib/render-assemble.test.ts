import { describe, it, expect } from "vitest";
import {
  assemblePlanItems,
  resolveClipSec,
  resolveClipStart,
  type AssembleItem,
} from "./render-assemble";

function item(overrides: Partial<AssembleItem> = {}): AssembleItem {
  return {
    trackId: "t1",
    rank: 1,
    title: "Roaring Tides",
    artist: "Clannad",
    customLabel: null,
    clipMode: "active_snippet",
    clipStartSec: null,
    clipEndSec: null,
    snippetLenSec: null,
    durationSec: null,
    visual: null,
    audioRef: "t1.mp3",
    ...overrides,
  };
}

describe("resolveClipSec", () => {
  it("uses manual range length when provided", () => {
    expect(resolveClipSec(item({ clipMode: "manual", clipStartSec: 15, clipEndSec: 65 }), { defaultClipSec: 30 })).toBe(50);
  });
  it("falls back to default for manual without a valid end", () => {
    expect(resolveClipSec(item({ clipMode: "manual", clipStartSec: 10, clipEndSec: null }), { defaultClipSec: 30 })).toBe(30);
    expect(resolveClipSec(item({ clipMode: "manual", clipStartSec: 50, clipEndSec: 40 }), { defaultClipSec: 30 })).toBe(30);
  });
  it("uses snippet length or default for active mode", () => {
    expect(resolveClipSec(item({ snippetLenSec: 20 }), { defaultClipSec: 30 })).toBe(20);
    expect(resolveClipSec(item({ snippetLenSec: null }), { defaultClipSec: 30 })).toBe(30);
  });
  it("uses full track duration for full mode, else default", () => {
    expect(resolveClipSec(item({ clipMode: "full", durationSec: 187 }), { defaultClipSec: 30 })).toBe(187);
    expect(resolveClipSec(item({ clipMode: "full", durationSec: null }), { defaultClipSec: 30 })).toBe(30);
  });
});

describe("resolveClipStart", () => {
  it("uses manual start", () => {
    expect(resolveClipStart(item({ clipMode: "manual", clipStartSec: 15 }))).toBe(15);
  });
  it("uses RMS-resolved start for active mode, else 0", () => {
    expect(resolveClipStart(item({ resolvedStartSec: 42 }))).toBe(42);
    expect(resolveClipStart(item({ resolvedStartSec: null }))).toBe(0);
  });
  it("starts full mode at 0", () => {
    expect(resolveClipStart(item({ clipMode: "full", clipStartSec: 99 }))).toBe(0);
  });
});

describe("assemblePlanItems", () => {
  it("formats the default label and resolves clip timing", () => {
    const [p] = assemblePlanItems(
      [item({ rank: 5, resolvedStartSec: 12, snippetLenSec: 30 })],
      { defaultClipSec: 30 },
    );
    expect(p.label).toBe("5 - Roaring Tides (Clannad)");
    expect(p.clipStartSec).toBe(12);
    expect(p.clipSec).toBe(30);
  });

  it("prefers a custom label when set", () => {
    const [p] = assemblePlanItems([item({ customLabel: "Best track ever" })], {
      defaultClipSec: 30,
    });
    expect(p.label).toBe("Best track ever");
  });

  it("enforces a minimum clip length", () => {
    const [p] = assemblePlanItems(
      [item({ clipMode: "manual", clipStartSec: 0, clipEndSec: 0.1 })],
      { defaultClipSec: 0.1 },
    );
    expect(p.clipSec).toBeGreaterThanOrEqual(0.5);
  });
});

describe("audio-source clamping", () => {
  it("clamps the segment to what the audio source can fill", () => {
    // 30s snippet requested, but the source is 20s and starts at 5s -> 15s
    const [p] = assemblePlanItems(
      [item({ snippetLenSec: 30, resolvedStartSec: 5, durationSec: 20 })],
      { defaultClipSec: 30 },
    );
    expect(p.clipSec).toBe(15);
  });

  it("clamps a manual range that runs past the source end", () => {
    const [p] = assemblePlanItems(
      [item({ clipMode: "manual", clipStartSec: 10, clipEndSec: 40, durationSec: 20 })],
      { defaultClipSec: 30 },
    );
    expect(p.clipSec).toBe(10);
  });

  it("leaves clips alone when the duration is unknown or sufficient", () => {
    const [long] = assemblePlanItems(
      [item({ snippetLenSec: 30, durationSec: 200 })],
      { defaultClipSec: 30 },
    );
    expect(long.clipSec).toBe(30);
    const [unknown] = assemblePlanItems([item({ snippetLenSec: 30 })], {
      defaultClipSec: 30,
    });
    expect(unknown.clipSec).toBe(30);
  });
});

describe("visual resolution", () => {
  it("no visual -> #N placeholder", () => {
    const [p] = assemblePlanItems([item()], { defaultClipSec: 30 });
    expect(p.visual).toEqual({ kind: "none", path: null, crop: null, startSec: 0, loopSec: null });
  });

  it("image visual carries the ref and crop", () => {
    const crop = { x: 0, y: 0.1, w: 1, h: 0.8 };
    const [p] = assemblePlanItems(
      [item({ visual: { kind: "image", ref: "a1.png", crop } })],
      { defaultClipSec: 30 },
    );
    expect(p.visual).toEqual({ kind: "image", path: "a1.png", crop, startSec: 0, loopSec: null });
  });

  it("audio-synced video plays the exact audio fragment without looping", () => {
    const [p] = assemblePlanItems(
      [
        item({
          resolvedStartSec: 42,
          snippetLenSec: 30,
          durationSec: 200,
          visual: { kind: "video", ref: "v1.mp4", crop: null, syncedToAudio: true },
        }),
      ],
      { defaultClipSec: 30 },
    );
    expect(p.visual).toEqual({ kind: "video", path: "v1.mp4", crop: null, startSec: 42, loopSec: null });
  });

  it("visual-only video shorter than the segment loops over the available footage", () => {
    const [p] = assemblePlanItems(
      [
        item({
          snippetLenSec: 30,
          visual: {
            kind: "video",
            ref: "op.mp4",
            crop: null,
            startSec: 5,
            footageDurationSec: 20,
          },
        }),
      ],
      { defaultClipSec: 30 },
    );
    expect(p.visual).toEqual({ kind: "video", path: "op.mp4", crop: null, startSec: 5, loopSec: 15 });
  });

  it("visual-only video long enough plays straight from its offset", () => {
    const [p] = assemblePlanItems(
      [
        item({
          snippetLenSec: 30,
          visual: {
            kind: "video",
            ref: "op.mp4",
            crop: null,
            startSec: 10,
            footageDurationSec: 120,
          },
        }),
      ],
      { defaultClipSec: 30 },
    );
    expect(p.visual).toEqual({ kind: "video", path: "op.mp4", crop: null, startSec: 10, loopSec: null });
  });
});

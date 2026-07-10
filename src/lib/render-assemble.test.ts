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
    artRef: null,
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

describe("artCrop passthrough", () => {
  it("carries the crop into the plan item", () => {
    const [p] = assemblePlanItems(
      [item({ artCrop: { x: 0, y: 0.1, w: 1, h: 0.8 } })],
      { defaultClipSec: 30 },
    );
    expect(p.artCrop).toEqual({ x: 0, y: 0.1, w: 1, h: 0.8 });
  });

  it("defaults to null when the item has no crop", () => {
    const [p] = assemblePlanItems([item()], { defaultClipSec: 30 });
    expect(p.artCrop).toBeNull();
  });
});

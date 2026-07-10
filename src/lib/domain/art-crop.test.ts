import { describe, it, expect } from "vitest";
import {
  parseArtCrop,
  artCropStyle,
  cropFromColumns,
  type ArtCrop,
} from "./art-crop";

describe("parseArtCrop", () => {
  it("accepts null as an explicit reset", () => {
    expect(parseArtCrop(null)).toEqual({ ok: true, crop: null });
  });

  it("accepts a valid rect", () => {
    const res = parseArtCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    expect(res).toEqual({ ok: true, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } });
  });

  it("accepts the full-image rect", () => {
    expect(parseArtCrop({ x: 0, y: 0, w: 1, h: 1 })).toEqual({
      ok: true,
      crop: { x: 0, y: 0, w: 1, h: 1 },
    });
  });

  it("tolerates float noise slightly past 1 by clamping", () => {
    const res = parseArtCrop({ x: 0.5, y: 0, w: 0.5000001, h: 1.0000001 });
    expect(res.ok).toBe(true);
    if (res.ok && res.crop) {
      expect(res.crop.x + res.crop.w).toBeLessThanOrEqual(1);
      expect(res.crop.h).toBeLessThanOrEqual(1);
    }
  });

  it("rejects rects that overflow the image", () => {
    expect(parseArtCrop({ x: 0.6, y: 0, w: 0.5, h: 1 }).ok).toBe(false);
    expect(parseArtCrop({ x: 0, y: 0.5, w: 1, h: 0.6 }).ok).toBe(false);
  });

  it("rejects negative origins and non-positive sizes", () => {
    expect(parseArtCrop({ x: -0.1, y: 0, w: 0.5, h: 0.5 }).ok).toBe(false);
    expect(parseArtCrop({ x: 0, y: 0, w: 0, h: 0.5 }).ok).toBe(false);
    expect(parseArtCrop({ x: 0, y: 0, w: 0.5, h: -0.5 }).ok).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(parseArtCrop(undefined).ok).toBe(false);
    expect(parseArtCrop("crop").ok).toBe(false);
    expect(parseArtCrop({ x: 0, y: 0, w: 0.5 }).ok).toBe(false);
    expect(parseArtCrop({ x: NaN, y: 0, w: 0.5, h: 0.5 }).ok).toBe(false);
    expect(parseArtCrop({ x: Infinity, y: 0, w: 0.5, h: 0.5 }).ok).toBe(false);
    expect(parseArtCrop({ x: "0", y: 0, w: 0.5, h: 0.5 }).ok).toBe(false);
  });
});

describe("artCropStyle", () => {
  it("falls back to cover when there is no crop", () => {
    expect(artCropStyle(null)).toEqual({
      width: "100%",
      height: "100%",
      objectFit: "cover",
    });
  });

  it("positions the full-image rect as an exact fit", () => {
    const style = artCropStyle({ x: 0, y: 0, w: 1, h: 1 });
    expect(style.width).toBe("100%");
    expect(style.height).toBe("100%");
    expect(style.left).toBe("0%");
    expect(style.top).toBe("0%");
    expect(style.position).toBe("absolute");
    expect(style.maxWidth).toBe("none");
  });

  it("scales up and shifts for a centered half-size rect", () => {
    // crop the central quarter: image must be shown at 200% and shifted by -50%
    const style = artCropStyle({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(style.width).toBe("200%");
    expect(style.height).toBe("200%");
    expect(style.left).toBe("-50%");
    expect(style.top).toBe("-50%");
  });

  it("handles an edge-anchored rect", () => {
    // bottom-right quarter
    const style = artCropStyle({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(style.left).toBe("-100%");
    expect(style.top).toBe("-100%");
  });
});

describe("cropFromColumns", () => {
  it("returns a crop when all four columns are set", () => {
    const crop: ArtCrop = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(cropFromColumns(0.1, 0.2, 0.3, 0.4)).toEqual(crop);
  });

  it("returns null when any column is missing", () => {
    expect(cropFromColumns(null, null, null, null)).toBeNull();
    expect(cropFromColumns(0.1, 0.2, 0.3, null)).toBeNull();
    expect(cropFromColumns(null, 0.2, 0.3, 0.4)).toBeNull();
  });
});

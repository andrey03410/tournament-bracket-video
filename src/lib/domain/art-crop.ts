// Non-destructive per-position art crop: a normalized rect (0..1 fractions of the
// source image). The rect is expected to have a 16:9 aspect in source pixels (the
// video frame), which makes the CSS mapping below aspect-preserving automatically.

export interface ArtCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FitMode = "cover" | "fill" | "contain";

export type ParseArtCropResult =
  | { ok: true; crop: ArtCrop | null }
  | { ok: false };

// Absorbs float noise from client-side crop math (percent -> fraction rounding).
const EPS = 1e-4;

const isFrac = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Validate an artCrop payload. `null` is an explicit reset (ok, crop: null);
 * a rect must lie within the unit square (small float overflow is clamped).
 */
export function parseArtCrop(input: unknown): ParseArtCropResult {
  if (input === null) return { ok: true, crop: null };
  if (typeof input !== "object" || input === undefined) return { ok: false };
  const { x, y, w, h } = input as Record<string, unknown>;
  if (!isFrac(x) || !isFrac(y) || !isFrac(w) || !isFrac(h)) return { ok: false };
  if (x < 0 || y < 0 || w <= EPS || h <= EPS) return { ok: false };
  if (x + w > 1 + EPS || y + h > 1 + EPS) return { ok: false };
  const cw = Math.min(w, 1 - x);
  const ch = Math.min(h, 1 - y);
  return { ok: true, crop: { x, y, w: cw, h: ch } };
}

/** Map nullable Prisma columns to a crop (all four set) or null (auto cover). */
export function cropFromColumns(
  x: number | null | undefined,
  y: number | null | undefined,
  w: number | null | undefined,
  h: number | null | undefined,
): ArtCrop | null {
  if (x == null || y == null || w == null || h == null) return null;
  return { x, y, w, h };
}

const pct = (v: number) => `${Number((v * 100).toFixed(4))}%`;

/**
 * CSS for an <img>/<video> inside a relatively-positioned, overflow-hidden
 * container. `cover` (default) keeps the existing crop/cover behavior; `fill`
 * stretches to the container (ignoring the crop); `contain` letterboxes the
 * whole frame (ignoring the crop). Used by the Remotion composition and the
 * constructor thumbnails so the picture is identical everywhere.
 */
export function artCropStyle(
  crop: ArtCrop | null,
  fitMode: FitMode = "cover",
): Record<string, string> {
  if (fitMode === "fill") return { width: "100%", height: "100%", objectFit: "fill" };
  if (fitMode === "contain") return { width: "100%", height: "100%", objectFit: "contain" };
  if (!crop) return { width: "100%", height: "100%", objectFit: "cover" };
  return {
    position: "absolute",
    width: pct(1 / crop.w),
    height: pct(1 / crop.h),
    left: pct(-crop.x / crop.w),
    top: pct(-crop.y / crop.h),
    maxWidth: "none",
  };
}

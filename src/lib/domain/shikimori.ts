// Pure Shikimori helpers: normalizing REST v1 search hits and validating image
// paths before the server fetches them (SSRF guard). No network here.

export type ShikimoriType = "anime" | "character";

export interface AnimeResult {
  id: number;
  name: string;
  russian: string | null;
  posterPath: string | null;
  previewPath: string | null;
  kind: string | null;
  score: number | null;
  year: number | null;
}

export interface CharacterResult {
  id: number;
  name: string;
  russian: string | null;
  posterPath: string | null;
  previewPath: string | null;
}

interface RawImage { original?: unknown; preview?: unknown }
interface RawHit {
  id?: unknown;
  name?: unknown;
  russian?: unknown;
  image?: RawImage;
  kind?: unknown;
  score?: unknown;
  aired_on?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const imgPath = (img: RawImage | undefined, key: "original" | "preview"): string | null =>
  img && typeof img[key] === "string" ? (img[key] as string) : null;

export function mapAnimeResult(raw: unknown): AnimeResult | null {
  const h = raw as RawHit;
  if (typeof h?.id !== "number" || typeof h?.name !== "string") return null;
  const scoreNum = h.score != null ? Number(h.score) : NaN;
  const yearNum = typeof h.aired_on === "string" ? Number(h.aired_on.slice(0, 4)) : NaN;
  return {
    id: h.id,
    name: h.name,
    russian: str(h.russian),
    posterPath: imgPath(h.image, "original"),
    previewPath: imgPath(h.image, "preview"),
    kind: str(h.kind),
    score: Number.isFinite(scoreNum) && scoreNum > 0 ? scoreNum : null,
    year: Number.isFinite(yearNum) ? yearNum : null,
  };
}

export function mapCharacterResult(raw: unknown): CharacterResult | null {
  const h = raw as RawHit;
  if (typeof h?.id !== "number" || typeof h?.name !== "string") return null;
  return {
    id: h.id,
    name: h.name,
    russian: str(h.russian),
    posterPath: imgPath(h.image, "original"),
    previewPath: imgPath(h.image, "preview"),
  };
}

export function pickLabel(
  russian: string | null | undefined,
  name: string | null | undefined,
): string | null {
  return russian?.trim() || name?.trim() || null;
}

export function absoluteImageUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Only Shikimori poster/preview paths under /system are fetchable server-side.
// Rejects absolute URLs (foreign hosts), traversal and any other route.
export function isSafeImagePath(path: string): boolean {
  return /^\/system\/(animes|characters)\/(original|preview)\/\d+\.(jpe?g|png|webp)(\?\S*)?$/.test(
    path,
  );
}

export interface StudioResult {
  id: number;
  name: string;
}

interface RawStudio {
  id?: unknown;
  name?: unknown;
  filtered_name?: unknown;
}

/** Studios have no search endpoint — filter the full list by name locally. */
export function matchStudios(rawList: unknown[], query: string, limit: number): StudioResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: StudioResult[] = [];
  for (const raw of rawList) {
    const s = raw as RawStudio;
    if (typeof s?.id !== "number" || typeof s?.name !== "string" || !s.name.trim()) continue;
    const filtered = typeof s.filtered_name === "string" ? s.filtered_name : "";
    if (s.name.toLowerCase().includes(q) || filtered.toLowerCase().includes(q)) {
      out.push({ id: s.id, name: s.name });
    }
  }
  return out.slice(0, limit);
}

interface RawRoleEntry {
  roles?: unknown;
  character?: unknown;
}

/** Pull characters out of an /animes/:id/roles response, optionally Main-only. */
export function extractRoleCharacters(
  rawRoles: unknown[],
  role: "Main" | "all",
): CharacterResult[] {
  const out: CharacterResult[] = [];
  for (const raw of rawRoles) {
    const r = raw as RawRoleEntry;
    const roles = Array.isArray(r?.roles) ? r.roles : [];
    if (role === "Main" && !roles.includes("Main")) continue;
    const ch = mapCharacterResult(r?.character);
    if (ch) out.push(ch);
  }
  return out;
}

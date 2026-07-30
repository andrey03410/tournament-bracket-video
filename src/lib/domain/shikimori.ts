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

/**
 * Poster/preview path of a hit, normalized to the requested size bucket.
 * Titles without artwork come back as `/assets/globals/missing_original.jpg`,
 * which is not fetchable — those become null so callers skip them.
 */
const imgPath = (img: RawImage | undefined, key: "original" | "preview"): string | null =>
  resizeImagePath(img?.[key] as string | undefined, key);

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

/**
 * Guard for the modern poster URL the site itself shows (GraphQL
 * `poster.originalUrl`): absolute, on the configured Shikimori origin, under
 * /uploads/poster/. The legacy /system/ path serves an older, downscaled copy.
 */
export function isSafePosterUrl(base: string, url: string): boolean {
  let parsed: URL;
  let origin: URL;
  try {
    parsed = new URL(url);
    origin = new URL(base);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.host !== origin.host || parsed.protocol !== origin.protocol) return false;
  return /^\/uploads\/poster\/(animes|characters)\/\d+\/[\w.-]+\.(jpe?g|png|webp)$/.test(
    parsed.pathname,
  );
}

/**
 * Rewrite a /system image path to another size bucket. Favourites come with an
 * `x64` thumb only, while imports need `original` — the id and query suffix
 * (cache buster) are preserved. Returns null for anything unrecognized.
 */
export function resizeImagePath(
  path: string | null | undefined,
  size: "original" | "preview",
): string | null {
  if (typeof path !== "string") return null;
  const m = /^\/system\/(animes|characters)\/[^/]+\/(\d+\.(?:jpe?g|png|webp))(\?\S*)?$/.exec(path);
  return m ? `/system/${m[1]}/${size}/${m[2]}${m[3] ?? ""}` : null;
}

// ---- User profile, list & favourites ----

export const USER_RATE_STATUSES = [
  "planned",
  "watching",
  "rewatching",
  "completed",
  "on_hold",
  "dropped",
] as const;
export type UserRateStatus = (typeof USER_RATE_STATUSES)[number];

export interface ShikimoriUser {
  id: number;
  nickname: string;
  url: string | null;
  avatarUrl: string | null;
}

export function mapUser(raw: unknown): ShikimoriUser | null {
  const u = raw as { id?: unknown; nickname?: unknown; url?: unknown; avatar?: unknown };
  if (typeof u?.id !== "number" || typeof u?.nickname !== "string") return null;
  return {
    id: u.id,
    nickname: u.nickname,
    url: str(u.url),
    avatarUrl: str(u.avatar),
  };
}

/** One entry of a user's anime list: the anime plus that user's own rate. */
export interface UserRate {
  anime: AnimeResult;
  /** The user's own score 1..10; null when unrated (the API sends 0). */
  score: number | null;
  status: UserRateStatus;
  episodes: number;
  rewatches: number;
  updatedAt: string | null;
}

const isStatus = (v: unknown): v is UserRateStatus =>
  typeof v === "string" && (USER_RATE_STATUSES as readonly string[]).includes(v);

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function mapUserRate(raw: unknown): UserRate | null {
  const r = raw as {
    anime?: unknown;
    score?: unknown;
    status?: unknown;
    episodes?: unknown;
    rewatches?: unknown;
    updated_at?: unknown;
  };
  const anime = mapAnimeResult(r?.anime);
  if (!anime || !isStatus(r?.status)) return null; // manga rates and junk drop out
  const score = num(r.score);
  return {
    anime,
    score: score > 0 ? score : null,
    status: r.status,
    episodes: num(r.episodes),
    rewatches: num(r.rewatches),
    updatedAt: str(r.updated_at),
  };
}

export type UserRateOrder = "score" | "updated" | "name";

export interface UserRateQuery {
  /** Single status, or "all"/undefined for the whole list. */
  status?: UserRateStatus | "all";
  /** Keep only entries rated at least this high (unrated ones drop out). */
  minScore?: number;
  order?: UserRateOrder;
  limit?: number;
}

/** How many entries the list has per status (all statuses present as keys). */
export function countByStatus(rates: UserRate[]): Record<UserRateStatus, number> {
  const counts = Object.fromEntries(USER_RATE_STATUSES.map((s) => [s, 0])) as Record<
    UserRateStatus,
    number
  >;
  for (const r of rates) counts[r.status]++;
  return counts;
}

const label = (r: UserRate) => pickLabel(r.anime.russian, r.anime.name) ?? "";
const byUpdatedDesc = (a: UserRate, b: UserRate) =>
  (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

/** Filter + order + cut a user's list. Pure: the network part stays outside. */
export function selectUserRates(rates: UserRate[], query: UserRateQuery = {}): UserRate[] {
  const status = query.status && query.status !== "all" ? query.status : null;
  const minScore = query.minScore ?? 0;
  const out = rates.filter(
    (r) => (!status || r.status === status) && (r.score ?? 0) >= minScore,
  );

  const order = query.order ?? "score";
  out.sort((a, b) => {
    if (order === "name") return label(a).localeCompare(label(b), "ru");
    if (order === "updated") return byUpdatedDesc(a, b);
    // score: best first, unrated last, ties by freshness
    const diff = (b.score ?? 0) - (a.score ?? 0);
    return diff !== 0 ? diff : byUpdatedDesc(a, b);
  });

  return query.limit != null ? out.slice(0, Math.max(0, query.limit)) : out;
}

/** A favourites entry: same fields for animes and characters. */
export interface FavouriteItem {
  id: number;
  name: string;
  russian: string | null;
  posterPath: string | null;
  previewPath: string | null;
}

export interface Favourites {
  animes: FavouriteItem[];
  characters: FavouriteItem[];
}

function mapFavourite(raw: unknown): FavouriteItem | null {
  const f = raw as { id?: unknown; name?: unknown; russian?: unknown; image?: unknown };
  if (typeof f?.id !== "number" || typeof f?.name !== "string") return null;
  return {
    id: f.id,
    name: f.name,
    russian: str(f.russian),
    // favourites carry only an x64 thumb path -> rewrite to the real poster
    posterPath: resizeImagePath(f.image as string, "original"),
    previewPath: resizeImagePath(f.image as string, "preview"),
  };
}

/** Pull animes and characters out of a /users/:id/favourites response. */
export function extractFavourites(raw: unknown): Favourites {
  const f = raw as { animes?: unknown; characters?: unknown };
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(mapFavourite).filter((x): x is FavouriteItem => x != null);
  return { animes: list(f?.animes), characters: list(f?.characters) };
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

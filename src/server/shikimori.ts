import "server-only";
import {
  mapAnimeResult,
  mapCharacterResult,
  matchStudios,
  extractRoleCharacters,
  pickLabel,
  absoluteImageUrl,
  isSafeImagePath,
  type ShikimoriType,
  type AnimeResult,
  type CharacterResult,
  type StudioResult,
} from "@/lib/domain/shikimori";
import {
  shikimoriBase,
  searchAnimesRaw,
  searchCharactersRaw,
  fetchPoster,
  fetchStudiosRaw,
  fetchStudioAnimesRaw,
  fetchAnimeRolesRaw,
} from "@/lib/shikimori";
import { createArt } from "@/server/arts";

const MAX_RESULTS = 8;

export interface SearchDto {
  id: number;
  type: ShikimoriType;
  label: string | null;
  thumbUrl: string | null;
  posterPath: string | null;
  facts: string | null;
}

function animeFacts(kind: string | null, score: number | null, year: number | null): string | null {
  const parts: string[] = [];
  if (year != null) parts.push(String(year));
  if (kind) parts.push(kind.toUpperCase());
  if (score != null) parts.push(`★${score.toFixed(2)}`);
  return parts.length ? parts.join(" · ") : null;
}

const MAX_DISCOVERY = 50;
const clampLimit = (n: number | undefined, def: number) =>
  Math.min(Math.max(1, Math.floor(n ?? def)), MAX_DISCOVERY);

function thumbFor(base: string, previewPath: string | null): string | null {
  return previewPath && isSafeImagePath(previewPath) ? absoluteImageUrl(base, previewPath) : null;
}

function animeToDto(base: string, r: AnimeResult): SearchDto {
  return {
    id: r.id, type: "anime", label: pickLabel(r.russian, r.name),
    thumbUrl: thumbFor(base, r.previewPath), posterPath: r.posterPath,
    facts: animeFacts(r.kind, r.score, r.year),
  };
}

function characterToDto(base: string, r: CharacterResult): SearchDto {
  return {
    id: r.id, type: "character", label: pickLabel(r.russian, r.name),
    thumbUrl: thumbFor(base, r.previewPath), posterPath: r.posterPath,
    facts: r.russian && r.russian !== r.name ? r.name : null,
  };
}

export async function search(type: ShikimoriType, q: string, limit = MAX_RESULTS): Promise<SearchDto[]> {
  const query = q.trim();
  if (!query) return [];
  const base = shikimoriBase();

  if (type === "anime") {
    const raw = await searchAnimesRaw(query, limit);
    return raw.map(mapAnimeResult).filter((r): r is AnimeResult => r != null)
      .slice(0, limit).map((r) => animeToDto(base, r));
  }
  const raw = await searchCharactersRaw(query);
  return raw.map(mapCharacterResult).filter((r): r is CharacterResult => r != null)
    .slice(0, limit).map((r) => characterToDto(base, r));
}

export async function findStudio(query: string, limit = MAX_RESULTS): Promise<StudioResult[]> {
  if (!query.trim()) return [];
  const raw = await fetchStudiosRaw();
  return matchStudios(raw, query, clampLimit(limit, MAX_RESULTS));
}

export async function studioAnimes(
  studioId: number,
  opts: { order?: string; limit?: number } = {},
): Promise<SearchDto[]> {
  const order = opts.order?.trim() || "popularity";
  const limit = clampLimit(opts.limit, 20);
  const base = shikimoriBase();
  const raw = await fetchStudioAnimesRaw(studioId, order, limit);
  return raw.map(mapAnimeResult).filter((r): r is AnimeResult => r != null)
    .slice(0, limit).map((r) => animeToDto(base, r));
}

export async function animeCharacters(
  animeId: number,
  opts: { role?: "Main" | "all" } = {},
): Promise<SearchDto[]> {
  const base = shikimoriBase();
  const raw = await fetchAnimeRolesRaw(animeId);
  return extractRoleCharacters(raw, opts.role ?? "Main").map((r) => characterToDto(base, r));
}

export interface ImportPosterInput {
  type: ShikimoriType;
  id: number;
  posterPath: string;
  label: string | null;
  maxPoolBytes: number | null;
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
};

export async function importPoster(userId: string, input: ImportPosterInput): Promise<{ artId: string }> {
  if (!isSafeImagePath(input.posterPath)) throw new Error("BAD_IMAGE_PATH");
  const { data, contentType } = await fetchPoster(input.posterPath); // may throw POSTER_FETCH_FAILED
  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? ".jpg";
  const art = await createArt(userId, {
    fileName: `shikimori-${input.type}-${input.id}${ext}`,
    data,
    label: input.label,
    maxPoolBytes: input.maxPoolBytes,
  });
  return { artId: art.id };
}

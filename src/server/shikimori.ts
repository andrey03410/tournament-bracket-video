import "server-only";
import {
  mapAnimeResult,
  mapCharacterResult,
  pickLabel,
  absoluteImageUrl,
  isSafeImagePath,
  type ShikimoriType,
} from "@/lib/domain/shikimori";
import { shikimoriBase, searchAnimesRaw, searchCharactersRaw, fetchPoster } from "@/lib/shikimori";
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

export async function search(type: ShikimoriType, q: string, limit = MAX_RESULTS): Promise<SearchDto[]> {
  const query = q.trim();
  if (!query) return [];
  const base = shikimoriBase();
  const thumb = (p: string | null) => (p && isSafeImagePath(p) ? absoluteImageUrl(base, p) : null);

  if (type === "anime") {
    const raw = await searchAnimesRaw(query, limit);
    return raw
      .map(mapAnimeResult)
      .filter((r): r is NonNullable<typeof r> => r != null)
      .slice(0, limit)
      .map((r) => ({
        id: r.id, type, label: pickLabel(r.russian, r.name),
        thumbUrl: thumb(r.previewPath), posterPath: r.posterPath,
        facts: animeFacts(r.kind, r.score, r.year),
      }));
  }
  const raw = await searchCharactersRaw(query);
  return raw
    .map(mapCharacterResult)
    .filter((r): r is NonNullable<typeof r> => r != null)
    .slice(0, limit)
    .map((r) => ({
      id: r.id, type, label: pickLabel(r.russian, r.name),
      thumbUrl: thumb(r.previewPath), posterPath: r.posterPath,
      facts: r.russian && r.russian !== r.name ? r.name : null,
    }));
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

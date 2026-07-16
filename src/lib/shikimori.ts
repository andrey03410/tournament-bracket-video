import "server-only";
import { absoluteImageUrl, isSafeImagePath } from "@/lib/domain/shikimori";

const DEFAULT_BASE = "https://shikimori.io";
const TIMEOUT_MS = 10_000;

export function shikimoriBase(): string {
  return (process.env.SHIKIMORI_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
}

function userAgent(): string {
  return process.env.SHIKIMORI_USER_AGENT?.trim() || "tournament-bracket-video";
}

async function getJson(pathAndQuery: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${shikimoriBase()}${pathAndQuery}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (!res.ok) throw new Error(`SHIKIMORI_HTTP_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function searchAnimesRaw(q: string, limit: number): Promise<unknown[]> {
  const data = await getJson(`/api/animes?search=${encodeURIComponent(q)}&limit=${limit}`);
  return Array.isArray(data) ? data : [];
}

export async function searchCharactersRaw(q: string): Promise<unknown[]> {
  const data = await getJson(`/api/characters/search?search=${encodeURIComponent(q)}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchStudiosRaw(): Promise<unknown[]> {
  const data = await getJson(`/api/studios`);
  return Array.isArray(data) ? data : [];
}

export async function fetchStudioAnimesRaw(
  studioId: number,
  order: string,
  limit: number,
): Promise<unknown[]> {
  const data = await getJson(
    `/api/animes?studio=${studioId}&order=${encodeURIComponent(order)}&limit=${limit}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function fetchAnimeRolesRaw(animeId: number): Promise<unknown[]> {
  const data = await getJson(`/api/animes/${animeId}/roles`);
  return Array.isArray(data) ? data : [];
}

export async function fetchPoster(posterPath: string): Promise<{ data: Buffer; contentType: string }> {
  if (!isSafeImagePath(posterPath)) throw new Error("BAD_IMAGE_PATH");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(absoluteImageUrl(shikimoriBase(), posterPath), {
      headers: { "User-Agent": userAgent() },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("POSTER_FETCH_FAILED");
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) throw new Error("POSTER_FETCH_FAILED");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("POSTER_FETCH_FAILED");
    return { data: buf, contentType };
  } catch {
    throw new Error("POSTER_FETCH_FAILED");
  } finally {
    clearTimeout(t);
  }
}

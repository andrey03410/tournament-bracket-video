import "server-only";
import { absoluteImageUrl, isSafeImagePath } from "@/lib/domain/shikimori";

const DEFAULT_BASE = "https://shikimori.io";
const TIMEOUT_MS = 10_000;
// Shikimori allows ~5 requests/second; an agent walking a user's list makes
// bursts, so requests are serialized with a small gap and 429 is retried.
const MIN_INTERVAL_MS = 250;
const RETRY_BASE_MS = 1000;
const MAX_RETRIES = 2;

export function shikimoriBase(): string {
  return (process.env.SHIKIMORI_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
}

function userAgent(): string {
  return process.env.SHIKIMORI_USER_AGENT?.trim() || "tournament-bracket-video";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let gate: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Serialize outgoing requests keeping at least MIN_INTERVAL_MS between them. */
function throttle(): Promise<void> {
  const slot = gate.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  gate = slot.catch(() => {});
  return slot;
}

async function getOnce(pathAndQuery: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    await throttle();
    return await fetch(`${shikimoriBase()}${pathAndQuery}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

async function getJson(pathAndQuery: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await getOnce(pathAndQuery);
    if (res.status === 429) {
      // Back off and retry: a burst that trips the limit succeeds a second later.
      if (attempt >= MAX_RETRIES) throw new Error("RATE_LIMITED");
      await sleep(RETRY_BASE_MS * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`SHIKIMORI_HTTP_${res.status}`);
    return await res.json();
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

/** Profile by nickname (default) or by numeric id. Throws SHIKIMORI_HTTP_404. */
export async function fetchUserRaw(ref: string): Promise<unknown> {
  const key = ref.trim();
  const path = `/api/users/${encodeURIComponent(key)}`;
  return getJson(/^\d+$/.test(key) ? path : `${path}?is_nickname=1`);
}

/**
 * A user's anime list. The API caps `limit` at 5000 per page and lists that
 * long are unheard of, so one page is the whole list.
 */
export async function fetchUserAnimeRatesRaw(
  userId: number,
  status: string | null,
  limit = 5000,
): Promise<unknown[]> {
  const query = status ? `&status=${encodeURIComponent(status)}` : "";
  const data = await getJson(`/api/users/${userId}/anime_rates?limit=${limit}&page=1${query}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchUserFavouritesRaw(userId: number): Promise<unknown> {
  return getJson(`/api/users/${userId}/favourites`);
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

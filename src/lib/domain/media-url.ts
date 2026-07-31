import path from "node:path";
import { IMG_EXT } from "@/lib/domain/media-ext";

// Pure policy for importing media by URL: which link is a picture the pool can
// store itself, which one belongs to the yt-dlp downloader, and which address
// the server must refuse to visit at all (SSRF guard). No network here — the
// service layer fetches and re-checks every redirect hop against these rules.

export type MediaUrlKind = "image" | "media";

/** Parsed http(s) URL, or null for anything else (ftp/file/data/garbage). */
export function parseHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

/**
 * "image" when the path ends with an extension the pool stores as a picture,
 * "media" for every other http(s) link (the downloader figures those out),
 * null when it is not an http(s) URL.
 */
export function classifyMediaUrl(raw: string): MediaUrlKind | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const ext = path.extname(decodeSafe(url.pathname)).toLowerCase();
  return IMG_EXT.includes(ext) ? "image" : "media";
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Pool extension for a response's Content-Type, or null when the pool cannot
 * store that format (svg/avif/bmp) or the body is not an image at all.
 */
export function imageExtFromContentType(value: string | null | undefined): string | null {
  if (!value) return null;
  const type = value.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXT[type] ?? null;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

/** Host we never fetch from: machine-local names and private address literals. */
export function isBlockedHostname(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!name) return true;
  if (name === "localhost") return true;
  if (BLOCKED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  return isBlockedAddress(name);
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * Address a server-side fetch must not reach: loopback, link-local (including
 * the cloud metadata endpoint), private and other special-purpose ranges.
 * Anything that is not an IP literal is not this function's business (false).
 */
export function isBlockedAddress(value: string): boolean {
  const raw = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = parseIpv4(raw);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24 (docs)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  if (!raw.includes(":")) return false; // a hostname, not an address

  // IPv4-mapped/embedded form: judge by the embedded address.
  const embedded = raw.split(":").pop() ?? "";
  if (embedded.includes(".")) {
    const mapped = parseIpv4(embedded);
    if (mapped) return isBlockedAddress(embedded);
  }
  if (raw === "::" || raw === "::1") return true;
  const head = raw.replace(/^::/, "").split(":")[0] ?? "";
  if (/^f[cd]/.test(head)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(head)) return true; // fe80::/10 link-local
  return false;
}

const MAX_LABEL = 200;

/** Human label for an imported link: last path segment sans extension, else the host. */
export function urlLabel(raw: string): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const segment = decodeSafe(url.pathname).split("/").filter(Boolean).pop() ?? "";
  const base = segment
    ? path.basename(segment, path.extname(segment)).replace(/\s+/g, " ").trim()
    : "";
  return (base || url.hostname).slice(0, MAX_LABEL);
}

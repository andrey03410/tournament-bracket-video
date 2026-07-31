import path from "node:path";
import { AUDIO_EXT, VIDEO_EXT, IMG_EXT, isJunkName } from "@/lib/domain/media-ext";

// Access policy for importing media straight off the machine's disk (MCP tools).
// Pure path math: an allowlist of roots from the environment, plus the check
// "is this path inside one of them". No fs here — the service layer does the
// reading and re-checks the realpath so a symlink cannot lead out of a root.

export type LocalMediaKind = "image" | "video" | "audio";

/**
 * Parse MCP_LOCAL_MEDIA_DIRS: ':'-separated absolute roots, `~` expands to the
 * home directory. Relative entries are dropped — an allowlist must be absolute
 * to mean anything.
 */
export function parseMediaDirs(
  raw: string | undefined,
  { home }: { home: string },
): string[] {
  if (!raw) return [];
  const dirs: string[] = [];
  for (const part of raw.split(":")) {
    const entry = part.trim();
    if (!entry) continue;
    const expanded =
      entry === "~" ? home : entry.startsWith("~/") ? path.join(home, entry.slice(2)) : entry;
    if (!path.isAbsolute(expanded)) continue;
    const dir = path.normalize(expanded).replace(/\/+$/, "") || "/";
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

/**
 * Normalized `target` when it is one of `roots` or lives inside one, else null.
 * A sibling that merely starts with a root's name ("/media/ost-evil") is out.
 */
export function resolveInsideDirs(target: string, roots: readonly string[]): string | null {
  if (!path.isAbsolute(target)) return null;
  const full = path.normalize(target).replace(/\/+$/, "") || "/";
  for (const root of roots) {
    if (full === root || full.startsWith(root.endsWith("/") ? root : root + path.sep)) {
      return full;
    }
  }
  return null;
}

/** Pool kind of a filename, or null when the extension is not supported. */
export function localMediaKind(name: string): LocalMediaKind | null {
  if (isJunkName(name)) return null;
  const ext = path.extname(name).toLowerCase();
  if (!ext) return null;
  if (IMG_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (AUDIO_EXT.includes(ext)) return "audio";
  return null;
}

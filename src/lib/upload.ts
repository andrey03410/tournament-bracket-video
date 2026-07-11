import AdmZip from "adm-zip";

export const AUDIO_EXT = [".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus"];
// Browser-compatible containers only (no transcode on upload — agreed in spec 04).
export const VIDEO_EXT = [".mp4", ".webm", ".mov"];

export type TrackKind = "audio" | "video";

/** Skip macOS resource forks and dotfiles regardless of extension. */
function isJunk(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("__macosx") || (lower.split("/").pop()?.startsWith(".") ?? false);
}

/** Pure: is this filename a supported audio file? */
export function isAudioFile(name: string): boolean {
  if (isJunk(name)) return false;
  const lower = name.toLowerCase();
  return AUDIO_EXT.some((ext) => lower.endsWith(ext));
}

/** Pure: is this filename a supported video file? */
export function isVideoFile(name: string): boolean {
  if (isJunk(name)) return false;
  const lower = name.toLowerCase();
  return VIDEO_EXT.some((ext) => lower.endsWith(ext));
}

/** Pure: media kind by filename, or null if unsupported. */
export function mediaKind(name: string): TrackKind | null {
  if (isAudioFile(name)) return "audio";
  if (isVideoFile(name)) return "video";
  return null;
}

/** Pure: pick a display title — ID3 tag wins, else the filename without extension. */
export function deriveTitle(filename: string, tagTitle?: string | null): string {
  const tag = tagTitle?.trim();
  if (tag) return tag;
  const base = filename.split("/").pop() ?? filename;
  return base.replace(/\.[^.]+$/, "");
}

export interface ExtractedTrack {
  filename: string;
  kind: TrackKind;
  title: string;
  artist: string | null;
  durationSec: number | null;
  data: Buffer;
}

/**
 * Extract audio and video entries from a ZIP buffer. Audio titles/artist come
 * from embedded tags (music-metadata) with a filename fallback; video titles
 * always come from the filename (container tags are unreliable), duration is
 * taken from the container when parseable (ffmpeg probes it later otherwise).
 */
export async function extractTracksFromZip(
  zipBuffer: Buffer,
): Promise<ExtractedTrack[]> {
  // Dynamic import keeps the ESM-only music-metadata out of non-upload bundles.
  const mm = await import("music-metadata");
  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && mediaKind(e.entryName) !== null);

  const tracks: ExtractedTrack[] = [];
  for (const entry of entries) {
    const kind = mediaKind(entry.entryName)!;
    const data = entry.getData();
    let title: string | undefined;
    let artist: string | null = null;
    let durationSec: number | null = null;
    try {
      const meta = await mm.parseBuffer(data, undefined, {
        duration: true,
      });
      if (kind === "audio") {
        title = meta.common.title ?? undefined;
        artist = meta.common.artist ?? null;
      }
      durationSec = meta.format.duration ?? null;
    } catch {
      // unreadable tags -> fall back to filename
    }
    tracks.push({
      filename: entry.entryName,
      kind,
      title: deriveTitle(entry.entryName, title),
      artist,
      durationSec,
      data,
    });
  }
  // stable order by filename so uploads are deterministic
  tracks.sort((a, b) => a.filename.localeCompare(b.filename));
  return tracks;
}

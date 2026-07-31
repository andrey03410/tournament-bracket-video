import AdmZip from "adm-zip";
import { AUDIO_EXT, VIDEO_EXT, isJunkName as isJunk } from "@/lib/domain/media-ext";

export { AUDIO_EXT, VIDEO_EXT };

export type TrackKind = "audio" | "video";

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

import AdmZip from "adm-zip";

const AUDIO_EXT = [".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus"];

/** Pure: is this filename a supported audio file? */
export function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("__macosx") || lower.split("/").pop()?.startsWith(".")) {
    return false; // skip macOS resource forks and dotfiles
  }
  return AUDIO_EXT.some((ext) => lower.endsWith(ext));
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
  title: string;
  artist: string | null;
  durationSec: number | null;
  data: Buffer;
}

/**
 * Extract audio entries from a ZIP buffer. Titles/artist/duration come from
 * embedded tags (music-metadata) with a filename fallback.
 */
export async function extractTracksFromZip(
  zipBuffer: Buffer,
): Promise<ExtractedTrack[]> {
  // Dynamic import keeps the ESM-only music-metadata out of non-upload bundles.
  const mm = await import("music-metadata");
  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && isAudioFile(e.entryName));

  const tracks: ExtractedTrack[] = [];
  for (const entry of entries) {
    const data = entry.getData();
    let title: string | undefined;
    let artist: string | null = null;
    let durationSec: number | null = null;
    try {
      const meta = await mm.parseBuffer(data, undefined, {
        duration: true,
      });
      title = meta.common.title ?? undefined;
      artist = meta.common.artist ?? null;
      durationSec = meta.format.duration ?? null;
    } catch {
      // unreadable tags -> fall back to filename
    }
    tracks.push({
      filename: entry.entryName,
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

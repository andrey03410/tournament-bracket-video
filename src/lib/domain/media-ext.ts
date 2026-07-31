// Which filenames the pool accepts, as plain data: shared by the ZIP import
// (lib/upload.ts), the pool service (server/arts.ts) and the local-disk import
// (lib/domain/local-media.ts), so the three never drift apart.

export const AUDIO_EXT = [".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus"];
// Browser-compatible containers only (no transcode on upload — agreed in spec 04).
export const VIDEO_EXT = [".mp4", ".webm", ".mov"];
export const IMG_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

/** Pure: macOS resource forks and dotfiles are never media, whatever the extension. */
export function isJunkName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("__macosx") || (lower.split("/").pop()?.startsWith(".") ?? false);
}

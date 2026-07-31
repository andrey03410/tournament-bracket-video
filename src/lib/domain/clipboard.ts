import { baseOf } from "@/lib/domain/media-ext";
import { classifyMediaUrl, parseHttpUrl } from "@/lib/domain/media-url";

// Pure reading of a paste. Binary files in the clipboard are handled by the
// upload path already; what needs interpreting is the text/HTML flavor a
// browser puts there when the user copies a picture from a page.

export interface PastedFlavors {
  text?: string | null;
  html?: string | null;
}

const IMG_SRC =
  /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/**
 * The picture URL a paste refers to: the first `<img src>` of the HTML flavor,
 * else a bare text URL that already looks like an image. A pasted video/page
 * link stays out on purpose — it belongs in the download field, not in a silent
 * image import.
 */
export function pickPastedImageUrl({ text, html }: PastedFlavors): string | null {
  const match = html ? IMG_SRC.exec(html) : null;
  const src = match ? (match[1] ?? match[2] ?? match[3] ?? "").trim() : "";
  if (src && parseHttpUrl(src)) return src;

  const candidate = (text ?? "").trim();
  if (!candidate || /\s/.test(candidate)) return null;
  return classifyMediaUrl(candidate) === "image" ? candidate : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Label for a clipboard image, which arrives without a usable name. */
export function pasteLabel(date: Date): string {
  return `Вставка ${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

const GENERIC_NAMES = ["", "image", "unknown", "clipboard", "screenshot", "photo"];

/** True when the clipboard handed out a placeholder name worth replacing. */
export function isGenericPasteName(name: string): boolean {
  const trimmed = name.trim();
  const base = baseOf(trimmed).trim().toLowerCase();
  return GENERIC_NAMES.includes(base);
}

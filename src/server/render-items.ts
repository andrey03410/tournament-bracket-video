import "server-only";
import { prisma } from "@/lib/db";
import { parseArtCrop } from "@/lib/domain/art-crop";
import {
  parseAudioSource,
  parseMediaStartSec,
  type PoolMediaInfo,
} from "@/lib/domain/position-media";

// Business rules for editing a render item, extracted from the route so the
// whole behavior (ownership, crop validation, audio-source rules, lastUsedAt,
// cache invalidation) is integration-testable.

export interface RenderItemPatch {
  clipMode?: "manual" | "active_snippet" | "full";
  clipStartSec?: number | null;
  clipEndSec?: number | null;
  snippetLenSec?: number | null;
  customLabel?: string | null;
  artId?: string | null;
  /** Validated via parseArtCrop; null resets to auto-cover. */
  artCrop?: unknown;
  /** "track" | "media" — validated against the effective attached media. */
  audioSource?: unknown;
  /** Footage start offset for a visual-only video; null resets to 0. */
  mediaStartSec?: unknown;
}

const NO_CROP = { artCropX: null, artCropY: null, artCropW: null, artCropH: null };

type ArtRecord = { id: string; kind: string; durationSec: number | null; hasAudio: boolean };

function toMediaInfo(art: ArtRecord | null): PoolMediaInfo | null {
  if (!art) return null;
  return {
    kind: art.kind as PoolMediaInfo["kind"],
    durationSec: art.durationSec,
    hasAudio: art.hasAudio,
  };
}

export async function patchRenderItem(
  userId: string,
  itemId: string,
  patch: RenderItemPatch,
) {
  const item = await prisma.renderItem.findFirst({
    where: { id: itemId, renderConfig: { tournament: { userId } } },
    include: { art: true, track: true },
  });
  if (!item) throw new Error("NOT_FOUND");

  const { artCrop, audioSource, mediaStartSec, ...rest } = patch;
  const data: Record<string, unknown> = { ...rest };

  // Resolve the media the item will reference after this patch.
  let effectiveArt: ArtRecord | null = item.art;
  if (patch.artId != null) {
    const art = await prisma.art.findFirst({ where: { id: patch.artId, userId } });
    if (!art) throw new Error("ART_NOT_FOUND");
    effectiveArt = art;
    if (patch.artId !== item.artId) {
      await prisma.art.update({
        where: { id: art.id },
        data: { lastUsedAt: new Date() },
      });
      // A new media starts from defaults: auto-cover, footage from 0, track audio.
      Object.assign(data, NO_CROP, { mediaStartSec: null });
      if (audioSource === undefined) data.audioSource = "track";
    }
  } else if (patch.artId === null) {
    effectiveArt = null;
    Object.assign(data, NO_CROP, { mediaStartSec: null, audioSource: "track" });
  }
  const effectiveMedia = toMediaInfo(effectiveArt);

  if (audioSource !== undefined) {
    const parsed = parseAudioSource(audioSource, effectiveMedia);
    if (!parsed.ok) throw new Error(parsed.error);
    data.audioSource = parsed.audioSource;
  }

  if (mediaStartSec !== undefined) {
    if (!effectiveMedia || effectiveMedia.kind !== "video") throw new Error("NO_VIDEO");
    const parsed = parseMediaStartSec(mediaStartSec, effectiveMedia.durationSec);
    if (!parsed.ok) throw new Error("INVALID_START");
    data.mediaStartSec = parsed.value;
  }

  if (artCrop !== undefined) {
    const parsed = parseArtCrop(artCrop);
    if (!parsed.ok) throw new Error("INVALID_CROP");
    if (parsed.crop) {
      // A crop needs a visual to crop: attached media or the video track's footage.
      if (!effectiveArt && item.track.kind !== "video") throw new Error("NO_ART");
      Object.assign(data, {
        artCropX: parsed.crop.x,
        artCropY: parsed.crop.y,
        artCropW: parsed.crop.w,
        artCropH: parsed.crop.h,
      });
    } else {
      Object.assign(data, NO_CROP);
    }
  }

  // Invalidate the cached active-snippet start when the inputs that determine it
  // change (mode switch, snippet length, or which file the audio comes from).
  if (
    patch.clipMode !== undefined ||
    patch.snippetLenSec !== undefined ||
    (data.audioSource !== undefined && data.audioSource !== item.audioSource)
  ) {
    data.resolvedStartSec = null;
  }

  return prisma.renderItem.update({ where: { id: item.id }, data });
}

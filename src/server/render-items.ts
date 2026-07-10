import "server-only";
import { prisma } from "@/lib/db";
import { parseArtCrop } from "@/lib/domain/art-crop";

// Business rules for editing a render item, extracted from the route so the
// whole behavior (ownership, crop validation, lastUsedAt, cache invalidation)
// is integration-testable.

export interface RenderItemPatch {
  clipMode?: "manual" | "active_snippet" | "full";
  clipStartSec?: number | null;
  clipEndSec?: number | null;
  snippetLenSec?: number | null;
  customLabel?: string | null;
  artId?: string | null;
  /** Validated via parseArtCrop; null resets to auto-cover. */
  artCrop?: unknown;
}

const NO_CROP = { artCropX: null, artCropY: null, artCropW: null, artCropH: null };

export async function patchRenderItem(
  userId: string,
  itemId: string,
  patch: RenderItemPatch,
) {
  const item = await prisma.renderItem.findFirst({
    where: { id: itemId, renderConfig: { tournament: { userId } } },
  });
  if (!item) throw new Error("NOT_FOUND");

  const { artCrop, ...rest } = patch;
  const data: Record<string, unknown> = { ...rest };

  if (patch.artId != null) {
    const art = await prisma.art.findFirst({ where: { id: patch.artId, userId } });
    if (!art) throw new Error("ART_NOT_FOUND");
    if (patch.artId !== item.artId) {
      await prisma.art.update({
        where: { id: art.id },
        data: { lastUsedAt: new Date() },
      });
      Object.assign(data, NO_CROP); // a new art starts from auto-cover
    }
  } else if (patch.artId === null) {
    Object.assign(data, NO_CROP);
  }

  if (artCrop !== undefined) {
    const parsed = parseArtCrop(artCrop);
    if (!parsed.ok) throw new Error("INVALID_CROP");
    if (parsed.crop) {
      const effectiveArt = patch.artId !== undefined ? patch.artId : item.artId;
      if (!effectiveArt) throw new Error("NO_ART");
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
  // change (mode switch or snippet length), so it gets recomputed on next load.
  if (patch.clipMode !== undefined || patch.snippetLenSec !== undefined) {
    data.resolvedStartSec = null;
  }

  return prisma.renderItem.update({ where: { id: item.id }, data });
}

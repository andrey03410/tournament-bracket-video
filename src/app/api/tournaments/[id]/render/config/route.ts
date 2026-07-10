import { NextResponse } from "next/server";
import { z } from "zod";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  ensureRenderConfig,
  getRenderConfig,
  buildPreviewPlan,
  resolveActiveSnippets,
} from "@/server/render";
import { cropFromColumns } from "@/lib/domain/art-crop";

function serialize(config: NonNullable<Awaited<ReturnType<typeof getRenderConfig>>>) {
  return {
    id: config.id,
    order: config.order,
    template: config.template,
    defaultClipSec: config.defaultClipSec,
    introEnabled: config.introEnabled,
    introText: config.introText,
    outroEnabled: config.outroEnabled,
    outroText: config.outroText,
    items: config.items.map((it) => ({
      id: it.id,
      trackId: it.trackId,
      rank: it.rank,
      title: it.track.title,
      artist: it.track.artist,
      durationSec: it.track.durationSec,
      trackKind: it.track.kind,
      audioUrl: `/api/tracks/${it.trackId}/audio`,
      clipMode: it.clipMode,
      clipStartSec: it.clipStartSec,
      clipEndSec: it.clipEndSec,
      snippetLenSec: it.snippetLenSec,
      resolvedStartSec: it.resolvedStartSec,
      customLabel: it.customLabel,
      artId: it.artId,
      artUrl: it.artId ? `/api/arts/${it.artId}` : null,
      art: it.art
        ? {
            kind: it.art.kind,
            durationSec: it.art.durationSec,
            hasAudio: it.art.hasAudio,
            posterUrl: it.art.posterPath ? `/api/arts/${it.art.id}?poster=1` : null,
          }
        : null,
      artCrop: cropFromColumns(it.artCropX, it.artCropY, it.artCropW, it.artCropH),
      audioSource: it.audioSource,
      mediaStartSec: it.mediaStartSec,
    })),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  try {
    await ensureRenderConfig(auth.userId, params.id);
    // Resolve durations + active-snippet starts so the preview seeks correctly.
    await resolveActiveSnippets(auth.userId, params.id);
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg === "NOT_FOUND") return notFound();
    return badRequest(msg);
  }
  const config = await getRenderConfig(auth.userId, params.id);
  if (!config) return notFound();
  return NextResponse.json({ config: serialize(config), previewPlan: buildPreviewPlan(config) });
}

const patchSchema = z.object({
  order: z.enum(["desc", "asc"]).optional(),
  template: z.string().optional(),
  defaultClipSec: z.number().positive().max(600).optional(),
  introEnabled: z.boolean().optional(),
  introText: z.string().nullable().optional(),
  outroEnabled: z.boolean().optional(),
  outroText: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const config = await getRenderConfig(auth.userId, params.id);
  if (!config) return notFound();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Некорректные настройки");

  await prisma.renderConfig.update({ where: { id: config.id }, data: parsed.data });
  const updated = await getRenderConfig(auth.userId, params.id);
  return NextResponse.json({ config: updated ? serialize(updated) : null });
}

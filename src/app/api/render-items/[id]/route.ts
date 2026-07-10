import { NextResponse } from "next/server";
import { z } from "zod";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { patchRenderItem, type RenderItemPatch } from "@/server/render-items";

const schema = z.object({
  clipMode: z.enum(["manual", "active_snippet", "full"]).optional(),
  clipStartSec: z.number().min(0).nullable().optional(),
  clipEndSec: z.number().min(0).nullable().optional(),
  snippetLenSec: z.number().positive().max(600).nullable().optional(),
  customLabel: z.string().nullable().optional(),
  artId: z.string().nullable().optional(),
});

const SERVICE_ERRORS: Record<string, string> = {
  ART_NOT_FOUND: "Медиа не найдено",
  INVALID_CROP: "Некорректная рамка обрезки",
  NO_ART: "Сначала выберите медиа для позиции",
  INVALID_AUDIO_SOURCE: "Некорректный источник звука",
  NO_MEDIA_AUDIO: "У выбранного медиа нет аудиодорожки",
  NO_VIDEO: "Старт видеоряда доступен только для видео",
  INVALID_START: "Некорректный старт видеоряда",
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Некорректные данные элемента");

  // artCrop / audioSource / mediaStartSec are validated in the service (their
  // rules depend on the attached media and live in one place); forward each
  // only when the key is present (null = explicit reset).
  const patch: RenderItemPatch = { ...parsed.data };
  if (typeof body === "object" && body !== null) {
    for (const key of ["artCrop", "audioSource", "mediaStartSec"] as const) {
      if (key in body) patch[key] = (body as Record<string, unknown>)[key];
    }
  }

  try {
    const updated = await patchRenderItem(auth.userId, params.id, patch);
    return NextResponse.json({ ok: true, item: { id: updated.id } });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg in SERVICE_ERRORS) return badRequest(SERVICE_ERRORS[msg]);
    throw e;
  }
}

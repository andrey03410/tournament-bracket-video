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
  ART_NOT_FOUND: "Арт не найден",
  INVALID_CROP: "Некорректная рамка обрезки",
  NO_ART: "Сначала выберите арт для позиции",
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Некорректные данные элемента");

  // artCrop is validated in the service (parseArtCrop) so its rules live in one
  // place; forward it only when the key is present (null = explicit reset).
  const patch: RenderItemPatch = { ...parsed.data };
  if (typeof body === "object" && body !== null && "artCrop" in body) {
    patch.artCrop = (body as Record<string, unknown>).artCrop;
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

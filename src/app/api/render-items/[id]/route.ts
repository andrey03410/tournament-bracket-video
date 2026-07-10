import { NextResponse } from "next/server";
import { z } from "zod";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";

const schema = z.object({
  clipMode: z.enum(["manual", "active_snippet", "full"]).optional(),
  clipStartSec: z.number().min(0).nullable().optional(),
  clipEndSec: z.number().min(0).nullable().optional(),
  snippetLenSec: z.number().positive().max(600).nullable().optional(),
  customLabel: z.string().nullable().optional(),
  artId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const item = await prisma.renderItem.findFirst({
    where: { id: params.id, renderConfig: { tournament: { userId: auth.userId } } },
  });
  if (!item) return notFound();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Некорректные данные элемента");

  // If an art is referenced, ensure it belongs to the user.
  if (parsed.data.artId) {
    const art = await prisma.art.findFirst({
      where: { id: parsed.data.artId, userId: auth.userId },
    });
    if (!art) return badRequest("Арт не найден");
  }

  // Invalidate the cached active-snippet start when the inputs that determine it
  // change (mode switch or snippet length), so it gets recomputed on next load.
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.clipMode !== undefined || parsed.data.snippetLenSec !== undefined) {
    data.resolvedStartSec = null;
  }

  const updated = await prisma.renderItem.update({ where: { id: item.id }, data });
  return NextResponse.json({ ok: true, item: { id: updated.id } });
}

import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound, serverError } from "@/lib/api";
import { addTileToGroup, reorderGroupTiles } from "@/server/projects";

/** POST {artId} adds a card to the block; POST {order:[ids]} reorders them. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    if (Array.isArray(body.order)) {
      await reorderGroupTiles(auth.userId, params.id, body.order.map(String));
      return NextResponse.json({ ok: true });
    }
    const tile = await addTileToGroup(auth.userId, params.id, String(body.artId ?? ""));
    return NextResponse.json({ id: tile.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "NOT_GROUPS") return badRequest("Раунд не в режиме группового сравнения");
    if (msg === "TOO_MANY_TILES") return badRequest("В блоке может быть максимум 5 карточек");
    if (msg === "BAD_ART") return badRequest("Карточкой может быть картинка или видео из пула");
    if (msg === "INVALID_ORDER") return badRequest("Некорректный порядок карточек");
    return serverError(e);
  }
}

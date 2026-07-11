import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { addTile, reorderTiles } from "@/server/projects";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  try {
    if (Array.isArray(body.order)) {
      await reorderTiles(auth.userId, params.id, body.order.map(String));
      return NextResponse.json({ ok: true });
    }
    const tile = await addTile(auth.userId, params.id, String(body.artId ?? ""));
    return NextResponse.json({ id: tile.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "TOO_MANY_TILES") return badRequest("В раунде может быть максимум 9 блоков");
    if (msg === "BAD_ART") return badRequest("Блоком может быть картинка или видео из пула");
    if (msg === "INVALID_ORDER") return badRequest("Некорректный порядок блоков");
    throw e;
  }
}

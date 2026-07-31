import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound, serverError } from "@/lib/api";
import { moveTileToGroup } from "@/server/projects";

/** Move a card to another block of the same round. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    await moveTileToGroup(auth.userId, params.id, String(body.groupId ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "BAD_GROUP") return badRequest("Блок принадлежит другому раунду");
    if (msg === "TOO_MANY_TILES") return badRequest("В блоке может быть максимум 5 карточек");
    return serverError(e);
  }
}

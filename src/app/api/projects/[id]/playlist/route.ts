import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound, serverError } from "@/lib/api";
import { setPlaylist } from "@/server/projects";

/** Replace the project's background-music playlist (ordered audio art ids). */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const artIds = Array.isArray(body.artIds) ? body.artIds.map(String) : null;
  if (!artIds) return badRequest("Передайте artIds — массив аудио из пула");

  try {
    await setPlaylist(auth.userId, params.id, artIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "NOT_PICKER") return badRequest("Плейлист есть только у пикер-видео");
    if (msg === "BAD_MUSIC") return badRequest("В плейлист можно добавлять только аудио из пула");
    if (msg === "TOO_MANY_TRACKS") return badRequest("Слишком много треков (лимит 50)");
    return serverError(e);
  }
}

import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound, serverError } from "@/lib/api";
import { patchRound, deleteRound, setRoundMode } from "@/server/projects";

const ERRORS: Record<string, string> = {
  BAD_LABELS: "Некорректный режим подписей",
  BAD_REVEAL: "Время показа блока: от 1 до 60 секунд",
  BAD_TIMER: "Время таймера: от 1 до 60 секунд",
  BAD_BG: "Фоном может быть картинка или видео из пула",
  BAD_MUSIC: "Фоновой музыкой может быть аудио из пула",
  BAD_MODE: "Неизвестный режим раунда",
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    // Switching the mode migrates the tiles, so it runs before the rest.
    if (body.mode !== undefined) await setRoundMode(auth.userId, params.id, String(body.mode));
    await patchRound(auth.userId, params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (ERRORS[msg]) return badRequest(ERRORS[msg]);
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  try {
    await deleteRound(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    return serverError(e);
  }
}

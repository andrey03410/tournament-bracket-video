import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { addTopItem, reorderTopItems } from "@/server/projects";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  try {
    if (Array.isArray(body.order)) {
      await reorderTopItems(auth.userId, params.id, body.order.map(String));
      return NextResponse.json({ ok: true });
    }
    const item = await addTopItem(auth.userId, params.id, String(body.audioArtId ?? ""));
    return NextResponse.json({ id: item.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "NOT_TOP") return badRequest("Позиции есть только у ручного топа");
    if (msg === "NO_AUDIO_SOURCE")
      return badRequest("Источник звука позиции — аудио или видео со звуком из пула");
    if (msg === "INVALID_ORDER") return badRequest("Некорректный порядок позиций");
    throw e;
  }
}

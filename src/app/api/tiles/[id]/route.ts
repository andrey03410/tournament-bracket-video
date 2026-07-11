import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { patchTile, deleteTile } from "@/server/projects";

const ERRORS: Record<string, string> = {
  NO_VIDEO: "Сдвиг старта доступен только для видео-блоков",
  INVALID_START: "Сдвиг старта должен быть в пределах длительности видео",
  INVALID_CROP: "Некорректная обрезка",
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    await patchTile(auth.userId, params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (ERRORS[msg]) return badRequest(ERRORS[msg]);
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  try {
    await deleteTile(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    throw e;
  }
}

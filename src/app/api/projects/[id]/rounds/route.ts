import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound, serverError } from "@/lib/api";
import { addRound, reorderRounds } from "@/server/projects";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  try {
    if (Array.isArray(body.order)) {
      await reorderRounds(auth.userId, params.id, body.order.map(String));
      return NextResponse.json({ ok: true });
    }
    const round = await addRound(auth.userId, params.id);
    return NextResponse.json({ id: round.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "NOT_PICKER") return badRequest("Раунды есть только у пикер-видео");
    if (msg === "TOO_MANY_ROUNDS") return badRequest("Слишком много раундов (лимит 50)");
    if (msg === "INVALID_ORDER") return badRequest("Некорректный порядок раундов");
    return serverError(e);
  }
}

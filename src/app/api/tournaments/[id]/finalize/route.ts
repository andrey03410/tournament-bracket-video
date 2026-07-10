import { NextResponse } from "next/server";
import { userOr401, notFound, badRequest } from "@/lib/api";
import { getTournament, finalize } from "@/server/tournaments";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const topSize = Number(body?.topSize);

  const t = await getTournament(auth.userId, params.id);
  if (!t) return notFound();

  try {
    const result = await finalize(t, Number.isFinite(topSize) ? topSize : t.tracks.length);
    return NextResponse.json({ ok: true, topSize: result.topSize });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg === "NOT_COMPLETE") return badRequest("Турнир ещё не завершён");
    return badRequest(msg);
  }
}

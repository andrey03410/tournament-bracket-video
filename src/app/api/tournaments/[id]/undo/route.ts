import { NextResponse } from "next/server";
import { userOr401, notFound, badRequest } from "@/lib/api";
import { getTournament, undoLastAnswer } from "@/server/tournaments";

const MESSAGES: Record<string, string> = {
  NOTHING_TO_UNDO: "Отменять нечего",
  ALREADY_FINALIZED: "Турнир уже завершён",
};

/** Undo the last comparison screen — the whole group, not one of its pairs. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const t = await getTournament(auth.userId, params.id);
  if (!t) return notFound();

  try {
    const { removed } = await undoLastAnswer(t);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    const code = String((e as Error).message);
    return badRequest(MESSAGES[code] ?? code);
  }
}

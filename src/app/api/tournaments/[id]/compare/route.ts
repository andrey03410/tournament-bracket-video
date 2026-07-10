import { NextResponse } from "next/server";
import { userOr401, notFound, badRequest } from "@/lib/api";
import { isComparisonResult } from "@/lib/domain/types";
import { getTournament, recordComparison, nextComparison } from "@/server/tournaments";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const aId = body?.a;
  const bId = body?.b;
  const result = body?.result;
  if (typeof aId !== "string" || typeof bId !== "string" || !isComparisonResult(result)) {
    return badRequest("Некорректные данные сравнения");
  }

  const t = await getTournament(auth.userId, params.id);
  if (!t) return notFound();

  try {
    await recordComparison(t, aId, bId, result);
  } catch (e) {
    return badRequest(String((e as Error).message));
  }

  // reload to compute the next step
  const updated = await getTournament(auth.userId, params.id);
  const next = updated ? nextComparison(updated) : null;
  return NextResponse.json({ ok: true, isComplete: next?.isComplete ?? false });
}

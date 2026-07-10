import { NextResponse } from "next/server";
import { userOr401, notFound } from "@/lib/api";
import { deleteTournament } from "@/server/tournaments";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  try {
    await deleteTournament(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (String((e as Error).message) === "NOT_FOUND") return notFound();
    throw e;
  }
}

import { NextResponse } from "next/server";
import { userOr401, notFound } from "@/lib/api";
import { deleteTopItem } from "@/server/projects";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; itemId: string } },
) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  try {
    await deleteTopItem(auth.userId, params.id, params.itemId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    throw e;
  }
}

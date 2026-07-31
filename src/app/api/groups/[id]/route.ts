import { NextResponse } from "next/server";
import { userOr401, notFound, serverError } from "@/lib/api";
import { patchGroup, deleteGroup } from "@/server/projects";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    await patchGroup(auth.userId, params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    return serverError(e);
  }
}

/** Deleting a block deletes its cards — they only exist inside a block. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  try {
    await deleteGroup(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    return serverError(e);
  }
}

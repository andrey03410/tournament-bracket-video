import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound, serverError } from "@/lib/api";
import { addGroup } from "@/server/projects";

/** Add a block to a group-comparison round. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    const group = await addGroup(auth.userId, params.id, body.label ?? null);
    return NextResponse.json({ id: group.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (msg === "NOT_GROUPS") return badRequest("Раунд не в режиме группового сравнения");
    if (msg === "TOO_MANY_GROUPS") return badRequest("В раунде может быть максимум 3 блока");
    return serverError(e);
  }
}

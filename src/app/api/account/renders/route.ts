import { NextResponse } from "next/server";
import { userOr401 } from "@/lib/api";
import { listRenderRows } from "@/server/users";

/** Cabinet list of renders, newest first (cursor-paged, loaded on demand). */
export async function GET(req: Request) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const params = new URL(req.url).searchParams;
  const limitRaw = Number(params.get("limit"));
  const { rows, nextCursor } = await listRenderRows(auth.userId, {
    cursor: params.get("cursor") ?? undefined,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
  });
  return NextResponse.json({ renders: rows, nextCursor });
}

import { NextResponse } from "next/server";
import { userOr401, badRequest } from "@/lib/api";
import { listArts, listRecentArts, createArt, type ArtRow } from "@/server/arts";

function serialize(a: ArtRow) {
  return {
    id: a.id,
    label: a.label,
    url: `/api/arts/${a.id}`,
    usageCount: a.usageCount,
    lastUsedAt: a.lastUsedAt,
  };
}

export async function GET(req: Request) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const params = new URL(req.url).searchParams;
  if (params.get("recent")) {
    const arts = await listRecentArts(auth.userId);
    return NextResponse.json({ arts: arts.map(serialize), nextCursor: null });
  }

  const limitRaw = Number(params.get("limit"));
  const { arts, nextCursor } = await listArts(auth.userId, {
    q: params.get("q") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
  });
  return NextResponse.json({ arts: arts.map(serialize), nextCursor });
}

export async function POST(req: Request) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const form = await req.formData();
  const file = form.get("file");
  const label = String(form.get("label") ?? "").trim() || null;
  if (!(file instanceof File)) return badRequest("Прикрепите изображение");

  try {
    const art = await createArt(auth.userId, {
      fileName: file.name,
      data: Buffer.from(await file.arrayBuffer()),
      label,
    });
    return NextResponse.json({ id: art.id, url: `/api/arts/${art.id}`, label: art.label });
  } catch (e) {
    if ((e as Error).message === "BAD_EXT")
      return badRequest("Неподдерживаемый формат изображения");
    throw e;
  }
}

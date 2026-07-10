import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { absPath } from "@/lib/storage";
import { renameArt, deleteArt } from "@/server/arts";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const art = await prisma.art.findFirst({
    where: { id: params.id, userId: auth.userId },
  });
  if (!art) return notFound();

  const data = await readFile(absPath(art.filePath));
  const ext = path.extname(art.filePath).toLowerCase();
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

const patchSchema = z.object({ label: z.string().max(200).nullable() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Некорректное название");

  try {
    const art = await renameArt(auth.userId, params.id, parsed.data.label);
    return NextResponse.json({ id: art.id, label: art.label });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  try {
    await deleteArt(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    throw e;
  }
}

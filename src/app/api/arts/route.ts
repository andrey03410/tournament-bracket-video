import { NextResponse } from "next/server";
import path from "node:path";
import { userOr401, badRequest } from "@/lib/api";
import { prisma } from "@/lib/db";
import { saveFile, artPath } from "@/lib/storage";

export async function GET() {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const arts = await prisma.art.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    arts: arts.map((a) => ({ id: a.id, label: a.label, url: `/api/arts/${a.id}` })),
  });
}

const IMG_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

export async function POST(req: Request) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const form = await req.formData();
  const file = form.get("file");
  const label = String(form.get("label") ?? "").trim() || null;
  if (!(file instanceof File)) return badRequest("Прикрепите изображение");

  const ext = (path.extname(file.name) || ".jpg").toLowerCase();
  if (!IMG_EXT.includes(ext)) return badRequest("Неподдерживаемый формат изображения");

  const art = await prisma.art.create({
    data: { userId: auth.userId, filePath: "", label },
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const rel = await saveFile(artPath(auth.userId, art.id, ext), buffer);
  await prisma.art.update({ where: { id: art.id }, data: { filePath: rel } });

  return NextResponse.json({ id: art.id, url: `/api/arts/${art.id}`, label });
}

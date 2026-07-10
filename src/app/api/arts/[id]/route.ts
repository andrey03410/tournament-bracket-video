import { readFile } from "node:fs/promises";
import path from "node:path";
import { userOr401, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { absPath } from "@/lib/storage";

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

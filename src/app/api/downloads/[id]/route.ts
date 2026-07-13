import { NextResponse } from "next/server";
import { userOr401, notFound } from "@/lib/api";
import { cancelDownload } from "@/server/downloads";

/** Cancel an active download (kills yt-dlp) or remove a finished record. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  try {
    await cancelDownload(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    throw e;
  }
}

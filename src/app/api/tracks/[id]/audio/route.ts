import { readFile } from "node:fs/promises";
import path from "node:path";
import { userOr401, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { absPath } from "@/lib/storage";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const track = await prisma.track.findFirst({
    where: { id: params.id, tournament: { userId: auth.userId } },
  });
  if (!track) return notFound();

  const data = await readFile(absPath(track.filePath));
  const ext = path.extname(track.filePath).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";
  const total = data.length;

  // Honor HTTP Range requests so the <audio> element can seek before the whole
  // file has buffered (otherwise seeking only works on a re-listen, from cache).
  const range = req.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (start >= total || end >= total || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}`, "Accept-Ranges": "bytes" },
        });
      }
      const chunk = data.subarray(start, end + 1);
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

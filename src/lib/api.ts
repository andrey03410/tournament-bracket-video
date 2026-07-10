import { NextResponse } from "next/server";
import { requireUserId } from "@/auth";

/** Resolve the current user id or return a 401 response to short-circuit a route. */
export async function userOr401(): Promise<
  { userId: string } | { response: NextResponse }
> {
  try {
    const userId = await requireUserId();
    return { userId };
  } catch {
    return { response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound() {
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

/**
 * Serve a media buffer honoring HTTP Range requests, so <audio>/<video>
 * elements can seek before the whole file has buffered.
 */
export function mediaResponse(req: Request, data: Buffer, contentType: string): Response {
  const total = data.length;
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

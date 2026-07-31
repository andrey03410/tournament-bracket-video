import { NextResponse } from "next/server";
import { permissionOr403, badRequest, tooLarge, serverError } from "@/lib/api";
import { formatBytes, quotasFor } from "@/lib/domain/permissions";
import { artDto } from "@/lib/art-dto";
import { importImageFromUrl, MAX_IMAGE_BYTES } from "@/server/media-url";

/**
 * Import a picture by link into the pool. Videos and audio keep going through
 * the yt-dlp download jobs (`/api/downloads`) — the client picks the path with
 * `classifyMediaUrl`, and a NOT_IMAGE answer here sends it to the downloader.
 */
export async function POST(req: Request) {
  const auth = await permissionOr403("media:upload", "Импорт медиа недоступен вашей роли");
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  const label = body.label != null ? String(body.label) : null;
  if (!url) return badRequest("Укажите ссылку");

  const maxPoolBytes = quotasFor(auth.user.role).maxPoolBytes;

  try {
    const art = await importImageFromUrl(auth.userId, { url, label, maxPoolBytes });
    return NextResponse.json(artDto(art));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "BAD_URL") return badRequest("Это не похоже на ссылку http(s)");
    if (msg === "BLOCKED_HOST") return badRequest("По этому адресу ходить нельзя");
    if (msg === "NOT_IMAGE") {
      // the client turns this code into a "download as video/audio" offer
      return NextResponse.json(
        { error: "По ссылке не картинка (jpg, png, webp, gif)", code: "NOT_IMAGE" },
        { status: 400 },
      );
    }
    if (msg === "TOO_LARGE")
      return tooLarge(`Картинка больше ${formatBytes(MAX_IMAGE_BYTES)}`);
    if (msg === "FETCH_FAILED") return badRequest("Не удалось скачать по ссылке");
    if (msg === "POOL_QUOTA")
      return tooLarge(
        maxPoolBytes === null
          ? "Не влезает в пул медиа"
          : `Превышена квота пула медиа (${formatBytes(maxPoolBytes)}). Удалите лишнее в личном кабинете`,
      );
    return serverError(e);
  }
}

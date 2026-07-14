import { NextResponse } from "next/server";
import { permissionOr403, badRequest } from "@/lib/api";
import { quotasFor } from "@/lib/domain/permissions";
import { importPoster } from "@/server/shikimori";

export async function POST(req: Request) {
  const auth = await permissionOr403("media:upload", "Импорт медиа недоступен вашей роли");
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const type = body.type === "character" ? "character" : body.type === "anime" ? "anime" : null;
  const id = Number(body.id);
  const posterPath = String(body.posterPath ?? "");
  const label = body.label != null ? String(body.label) : null;
  if (!type || !Number.isFinite(id) || !posterPath) return badRequest("Некорректный запрос импорта");

  try {
    const { artId } = await importPoster(auth.userId, {
      type, id, posterPath, label,
      maxPoolBytes: quotasFor(auth.user.role).maxPoolBytes,
    });
    return NextResponse.json({ artId });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "BAD_IMAGE_PATH") return badRequest("Недопустимый адрес постера");
    if (msg === "POOL_QUOTA")
      return badRequest("Не влезает в квоту пула — освободите место в личном кабинете");
    if (msg === "POSTER_FETCH_FAILED") return badRequest("Не удалось скачать постер из Shikimori");
    throw e;
  }
}

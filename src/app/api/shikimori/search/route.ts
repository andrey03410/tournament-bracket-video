import { NextResponse } from "next/server";
import { permissionOr403, badRequest } from "@/lib/api";
import { search } from "@/server/shikimori";
import type { ShikimoriType } from "@/lib/domain/shikimori";

export async function GET(req: Request) {
  const auth = await permissionOr403("media:upload", "Импорт медиа недоступен вашей роли");
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q") ?? "";
  if (type !== "anime" && type !== "character") return badRequest("type: anime или character");

  try {
    const results = await search(type as ShikimoriType, q);
    return NextResponse.json({ results });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "RATE_LIMITED") return badRequest("Shikimori: слишком много запросов, подождите");
    return badRequest("Shikimori недоступен — попробуйте позже");
  }
}

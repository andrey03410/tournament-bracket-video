import { NextResponse } from "next/server";
import { userOr401, permissionOr403, badRequest } from "@/lib/api";
import { quotasFor } from "@/lib/domain/permissions";
import { listDownloads, startDownload } from "@/server/downloads";

function serialize(j: {
  id: string;
  url: string;
  mode: string;
  quality: number;
  title: string | null;
  status: string;
  progress: number;
  error: string | null;
  artId: string | null;
  createdAt: Date;
}) {
  return {
    id: j.id,
    url: j.url,
    mode: j.mode,
    quality: j.quality,
    title: j.title,
    status: j.status,
    progress: j.progress,
    error: j.error,
    artId: j.artId,
    createdAt: j.createdAt,
  };
}

export async function GET() {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const jobs = await listDownloads(auth.userId);
  return NextResponse.json({ jobs: jobs.map(serialize) });
}

export async function POST(req: Request) {
  const auth = await permissionOr403(
    "media:upload",
    "Загрузка медиа недоступна вашей роли",
  );
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  try {
    const job = await startDownload(auth.userId, {
      url: String(body.url ?? ""),
      mode: String(body.mode ?? "video"),
      quality: body.quality != null ? Number(body.quality) : undefined,
      maxPoolBytes: quotasFor(auth.user.role).maxPoolBytes,
    });
    return NextResponse.json({ id: job.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "BAD_URL") return badRequest("Вставьте корректную http(s)-ссылку на видео");
    if (msg === "BAD_QUALITY") return badRequest("Качество: 480, 720 или 1080");
    if (msg === "TOO_MANY_ACTIVE")
      return badRequest("Не больше двух одновременных загрузок — дождитесь завершения");
    throw e;
  }
}

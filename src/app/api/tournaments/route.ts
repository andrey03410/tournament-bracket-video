import { NextResponse } from "next/server";
import { userOr401, badRequest } from "@/lib/api";
import { isScheme } from "@/lib/domain/types";
import { extractTracksFromZip } from "@/lib/upload";
import { createTournament, listTournaments } from "@/server/tournaments";

export async function GET() {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const tournaments = await listTournaments(auth.userId);
  return NextResponse.json({ tournaments });
}

// Video archives are heavy; past this ceiling the request would die anyway —
// fail it honestly instead.
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export async function POST(req: Request) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ARCHIVE_BYTES) {
    return NextResponse.json(
      { error: "Архив слишком большой (лимит 2 ГБ)" },
      { status: 413 },
    );
  }

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  const scheme = String(form.get("scheme") ?? "");
  const blindMode = String(form.get("blindMode") ?? "") === "on";
  const file = form.get("file");

  if (!title) return badRequest("Укажите название");
  if (!isScheme(scheme)) return badRequest("Неизвестная схема");
  if (!(file instanceof File)) return badRequest("Прикрепите ZIP-архив с треками");

  const buffer = Buffer.from(await file.arrayBuffer());
  let tracks;
  try {
    tracks = await extractTracksFromZip(buffer);
  } catch {
    return badRequest("Не удалось прочитать архив");
  }
  if (tracks.length < 2) {
    return badRequest("В архиве должно быть минимум 2 аудио- или видеофайла");
  }

  const tournament = await createTournament(
    auth.userId,
    { title, scheme, blindMode },
    tracks,
  );
  return NextResponse.json({ id: tournament.id, trackCount: tracks.length });
}

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

export async function POST(req: Request) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  const scheme = String(form.get("scheme") ?? "");
  const blindMode = String(form.get("blindMode") ?? "") === "on";
  const file = form.get("file");

  if (!title) return badRequest("Укажите название");
  if (!isScheme(scheme)) return badRequest("Неизвестная схема");
  if (!(file instanceof File)) return badRequest("Прикрепите ZIP-архив с OST");

  const buffer = Buffer.from(await file.arrayBuffer());
  let tracks;
  try {
    tracks = await extractTracksFromZip(buffer);
  } catch {
    return badRequest("Не удалось прочитать архив");
  }
  if (tracks.length < 2) {
    return badRequest("В архиве должно быть минимум 2 аудиофайла");
  }

  const tournament = await createTournament(
    auth.userId,
    { title, scheme, blindMode },
    tracks,
  );
  return NextResponse.json({ id: tournament.id, trackCount: tracks.length });
}

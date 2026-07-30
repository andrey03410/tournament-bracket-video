import { NextResponse } from "next/server";
import { userOr401, badRequest, notFound } from "@/lib/api";
import {
  getProject,
  patchProject,
  deleteProject,
  effectivePlaylist,
  type LoadedProject,
} from "@/server/projects";
import { buildPickerPreviewPlan, invalidRounds } from "@/server/picker-render";

const ERRORS: Record<string, string> = {
  NO_TITLE: "Укажите название",
  BAD_REVEAL: "Время показа блока: от 1 до 60 секунд",
  BAD_TIMER: "Время таймера: от 1 до 60 секунд",
  BAD_BG: "Фоном может быть картинка или видео из пула",
  BAD_MUSIC: "Фоновой музыкой может быть аудио из пула",
  BAD_ORIENTATION: "Ориентация блоков: горизонтальная или вертикальная",
  BAD_BOOKEND_TEXT: "Текст интро/аутро: не больше 120 символов",
};

function artDto(a: LoadedProject["bgArt"]) {
  if (!a) return null;
  return {
    id: a.id,
    kind: a.kind,
    label: a.label,
    url: `/api/arts/${a.id}`,
    posterUrl: a.posterPath ? `/api/arts/${a.id}?poster=1` : null,
    durationSec: a.durationSec,
    hasAudio: a.hasAudio,
  };
}

function serialize(p: LoadedProject) {
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    revealSec: p.revealSec,
    hideAfterReveal: p.hideAfterReveal,
    timerSec: p.timerSec,
    tickSound: p.tickSound,
    bgArt: artDto(p.bgArt),
    bgMusicArt: artDto(p.bgMusicArt),
    // effective playlist (legacy single bgMusicArt shows up as one item)
    playlist: effectivePlaylist(p).map((a) => artDto(a)),
    tileOrientation: p.tileOrientation,
    introEnabled: p.introEnabled,
    introText: p.introText,
    outroEnabled: p.outroEnabled,
    outroText: p.outroText,
    rounds: p.rounds.map((r) => ({
      id: r.id,
      order: r.order,
      prompt: r.prompt,
      showPrompt: r.showPrompt,
      labelsMode: r.labelsMode,
      revealSec: r.revealSec,
      hideAfterReveal: r.hideAfterReveal,
      timerSec: r.timerSec,
      bgArt: artDto(r.bgArt),
      bgMusicArt: artDto(r.bgMusicArt),
      tileOrientation: r.tileOrientation,
      tiles: r.tiles.map((t) => ({
        id: t.id,
        order: t.order,
        artId: t.artId,
        art: artDto(t.art),
        label: t.label,
        isAnswer: t.isAnswer,
        playSound: t.playSound,
        startSec: t.startSec,
        crop:
          t.cropX != null && t.cropY != null && t.cropW != null && t.cropH != null
            ? { x: t.cropX, y: t.cropY, w: t.cropW, h: t.cropH }
            : null,
        fitMode: t.fitMode,
      })),
    })),
    invalidRounds: invalidRounds(p),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const project = await getProject(auth.userId, params.id);
  if (!project) return notFound();
  const payload: Record<string, unknown> = { project: serialize(project) };
  if (project.kind === "picker") {
    payload.previewPlan = buildPickerPreviewPlan(project);
    payload.tickUrl = "/api/assets/tick";
  }
  return NextResponse.json(payload);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    await patchProject(auth.userId, params.id, body);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return notFound();
    if (ERRORS[msg]) return badRequest(ERRORS[msg]);
    throw e;
  }
  return GET(req, { params });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  try {
    await deleteProject(auth.userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return notFound();
    throw e;
  }
}

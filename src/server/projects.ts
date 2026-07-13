import "server-only";
import path from "node:path";
import { prisma } from "@/lib/db";
import { removePath } from "@/lib/storage";
import { parseArtCrop } from "@/lib/domain/art-crop";
import { MAX_TILES } from "@/lib/domain/picker-layout";

// Video projects (phase 6): a standalone "top" (manual positions) or a
// "picker" (rounds of 2-9 tiles). Framework-free service layer, thin routes
// on top, fully covered by integration tests.

export const PROJECT_KINDS = ["top", "picker"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

const LIMITS = {
  revealSec: { min: 1, max: 60 },
  timerSec: { min: 1, max: 60 },
  maxRounds: 50,
};

export async function createProject(userId: string, title: string, kind: string) {
  if (!PROJECT_KINDS.includes(kind as ProjectKind)) throw new Error("BAD_KIND");
  const name = title.trim();
  if (!name) throw new Error("NO_TITLE");
  const project = await prisma.videoProject.create({
    data: { userId, title: name, kind },
  });
  if (kind === "top") {
    await prisma.renderConfig.create({
      data: { projectId: project.id, introText: name, outroText: "Спасибо за просмотр" },
    });
  } else {
    // A picker starts with one empty round so the constructor has something to show.
    await prisma.pickerRound.create({ data: { projectId: project.id, order: 0 } });
  }
  return project;
}

export async function listProjects(userId: string) {
  return prisma.videoProject.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { rounds: true, renderJobs: true } },
      renderConfig: { include: { _count: { select: { items: true } } } },
    },
  });
}

const PROJECT_INCLUDE = {
  bgArt: true,
  bgMusicArt: true,
  playlist: {
    orderBy: { order: "asc" as const },
    include: { art: true },
  },
  rounds: {
    orderBy: { order: "asc" as const },
    include: {
      bgArt: true,
      bgMusicArt: true,
      tiles: { orderBy: { order: "asc" as const }, include: { art: true } },
    },
  },
} as const;

export async function getProject(userId: string, id: string) {
  return prisma.videoProject.findFirst({
    where: { id, userId },
    include: PROJECT_INCLUDE,
  });
}

export type LoadedProject = NonNullable<Awaited<ReturnType<typeof getProject>>>;

async function ownedProject(userId: string, id: string) {
  const project = await prisma.videoProject.findFirst({ where: { id, userId } });
  if (!project) throw new Error("NOT_FOUND");
  return project;
}

function checkRange(value: number, r: { min: number; max: number }) {
  return Number.isFinite(value) && value >= r.min && value <= r.max;
}

/** Resolve a user's own art of the expected kinds (or null to clear). */
async function resolveArtRef(
  userId: string,
  artId: unknown,
  kinds: string[],
  err: string,
): Promise<string | null> {
  if (artId === null) return null;
  if (typeof artId !== "string") throw new Error(err);
  const art = await prisma.art.findFirst({ where: { id: artId, userId } });
  if (!art || !kinds.includes(art.kind)) throw new Error(err);
  if (art.kind === "video" || art.kind === "audio") {
    // background music must actually carry sound
    if (kinds.includes("audio") && !art.hasAudio) throw new Error(err);
  }
  return art.id;
}

export interface ProjectPatch {
  title?: string;
  revealSec?: number;
  hideAfterReveal?: boolean;
  timerSec?: number;
  tickSound?: boolean;
  bgArtId?: unknown; // image|video art id, or null to clear
  bgMusicArtId?: unknown; // audio art id, or null to clear
}

export async function patchProject(userId: string, id: string, patch: ProjectPatch) {
  await ownedProject(userId, id);
  const data: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (!t) throw new Error("NO_TITLE");
    data.title = t;
  }
  if (patch.revealSec !== undefined) {
    if (!checkRange(patch.revealSec, LIMITS.revealSec)) throw new Error("BAD_REVEAL");
    data.revealSec = patch.revealSec;
  }
  if (patch.timerSec !== undefined) {
    if (!checkRange(patch.timerSec, LIMITS.timerSec)) throw new Error("BAD_TIMER");
    data.timerSec = patch.timerSec;
  }
  if (patch.hideAfterReveal !== undefined) data.hideAfterReveal = Boolean(patch.hideAfterReveal);
  if (patch.tickSound !== undefined) data.tickSound = Boolean(patch.tickSound);
  if (patch.bgArtId !== undefined) {
    data.bgArtId = await resolveArtRef(userId, patch.bgArtId, ["image", "video"], "BAD_BG");
  }
  if (patch.bgMusicArtId !== undefined) {
    data.bgMusicArtId = await resolveArtRef(userId, patch.bgMusicArtId, ["audio"], "BAD_MUSIC");
  }
  return prisma.videoProject.update({ where: { id }, data });
}

/** Delete a project with its render outputs (rows cascade). */
export async function deleteProject(userId: string, id: string) {
  const project = await prisma.videoProject.findFirst({
    where: { id, userId },
    include: { renderJobs: true },
  });
  if (!project) throw new Error("NOT_FOUND");
  for (const job of project.renderJobs) {
    if (job.outputPath) await removePath(job.outputPath);
    await removePath(path.join("renders", "tmp", job.id));
  }
  await prisma.videoProject.delete({ where: { id } });
}

/**
 * Effective background playlist: explicit items, or the legacy single
 * bgMusicArtId as a one-track playlist until the user saves a real one.
 */
export function effectivePlaylist(project: LoadedProject) {
  if (project.playlist.length > 0) return project.playlist.map((p) => p.art);
  return project.bgMusicArt ? [project.bgMusicArt] : [];
}

/** Replace the whole playlist (ordered audio art ids); clears the legacy field. */
export async function setPlaylist(userId: string, projectId: string, artIds: string[]) {
  const project = await ownedProject(userId, projectId);
  if (project.kind !== "picker") throw new Error("NOT_PICKER");
  if (artIds.length > 50) throw new Error("TOO_MANY_TRACKS");

  const arts = await prisma.art.findMany({ where: { id: { in: artIds }, userId } });
  const byId = new Map(arts.map((a) => [a.id, a]));
  for (const id of artIds) {
    const art = byId.get(id);
    if (!art || art.kind !== "audio" || !art.hasAudio) throw new Error("BAD_MUSIC");
  }

  await prisma.$transaction([
    prisma.pickerPlaylistItem.deleteMany({ where: { projectId } }),
    ...artIds.map((artId, i) =>
      prisma.pickerPlaylistItem.create({ data: { projectId, artId, order: i } }),
    ),
    prisma.videoProject.update({
      where: { id: projectId },
      data: { bgMusicArtId: null, updatedAt: new Date() },
    }),
  ]);
}

// ---- Picker rounds ----

async function ownedRound(userId: string, roundId: string) {
  const round = await prisma.pickerRound.findFirst({
    where: { id: roundId, project: { userId } },
    include: { tiles: true, project: true },
  });
  if (!round) throw new Error("NOT_FOUND");
  return round;
}

export async function addRound(userId: string, projectId: string) {
  const project = await ownedProject(userId, projectId);
  if (project.kind !== "picker") throw new Error("NOT_PICKER");
  const count = await prisma.pickerRound.count({ where: { projectId } });
  if (count >= LIMITS.maxRounds) throw new Error("TOO_MANY_ROUNDS");
  return prisma.pickerRound.create({ data: { projectId, order: count } });
}

export interface RoundPatch {
  prompt?: string | null;
  showPrompt?: boolean;
  labelsMode?: string;
  revealSec?: number | null;
  hideAfterReveal?: boolean | null;
  timerSec?: number | null;
  bgArtId?: unknown;
  bgMusicArtId?: unknown;
}

export async function patchRound(userId: string, roundId: string, patch: RoundPatch) {
  const round = await ownedRound(userId, roundId);
  const data: Record<string, unknown> = {};

  if (patch.prompt !== undefined) data.prompt = patch.prompt?.trim() || null;
  if (patch.showPrompt !== undefined) data.showPrompt = Boolean(patch.showPrompt);
  if (patch.labelsMode !== undefined) {
    if (!["always", "finale", "never"].includes(patch.labelsMode)) throw new Error("BAD_LABELS");
    data.labelsMode = patch.labelsMode;
  }
  if (patch.revealSec !== undefined) {
    if (patch.revealSec !== null && !checkRange(patch.revealSec, LIMITS.revealSec))
      throw new Error("BAD_REVEAL");
    data.revealSec = patch.revealSec;
  }
  if (patch.timerSec !== undefined) {
    if (patch.timerSec !== null && !checkRange(patch.timerSec, LIMITS.timerSec))
      throw new Error("BAD_TIMER");
    data.timerSec = patch.timerSec;
  }
  if (patch.hideAfterReveal !== undefined) {
    data.hideAfterReveal = patch.hideAfterReveal === null ? null : Boolean(patch.hideAfterReveal);
  }
  if (patch.bgArtId !== undefined) {
    data.bgArtId = await resolveArtRef(userId, patch.bgArtId, ["image", "video"], "BAD_BG");
  }
  if (patch.bgMusicArtId !== undefined) {
    data.bgMusicArtId = await resolveArtRef(userId, patch.bgMusicArtId, ["audio"], "BAD_MUSIC");
  }
  await prisma.pickerRound.update({ where: { id: round.id }, data });
  return touch(round.projectId);
}

export async function deleteRound(userId: string, roundId: string) {
  const round = await ownedRound(userId, roundId);
  await prisma.pickerRound.delete({ where: { id: round.id } });
  await renumber("pickerRound", { projectId: round.projectId });
  return touch(round.projectId);
}

export async function reorderRounds(userId: string, projectId: string, ids: string[]) {
  const project = await ownedProject(userId, projectId);
  const rounds = await prisma.pickerRound.findMany({ where: { projectId: project.id } });
  const known = new Set(rounds.map((r) => r.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id)))
    throw new Error("INVALID_ORDER");
  await prisma.$transaction(
    ids.map((id, i) => prisma.pickerRound.update({ where: { id }, data: { order: i } })),
  );
  return touch(projectId);
}

// ---- Picker tiles ----

export async function addTile(userId: string, roundId: string, artId: string) {
  const round = await ownedRound(userId, roundId);
  if (round.tiles.length >= MAX_TILES) throw new Error("TOO_MANY_TILES");
  const art = await prisma.art.findFirst({ where: { id: artId, userId } });
  if (!art || (art.kind !== "image" && art.kind !== "video")) throw new Error("BAD_ART");
  const tile = await prisma.pickerTile.create({
    data: { roundId, artId, order: round.tiles.length },
  });
  await prisma.art.update({ where: { id: artId }, data: { lastUsedAt: new Date() } });
  await touch(round.projectId);
  return tile;
}

export interface TilePatch {
  label?: string | null;
  isAnswer?: boolean;
  playSound?: boolean;
  startSec?: unknown;
  crop?: unknown;
}

export async function patchTile(userId: string, tileId: string, patch: TilePatch) {
  const tile = await prisma.pickerTile.findFirst({
    where: { id: tileId, round: { project: { userId } } },
    include: { art: true, round: true },
  });
  if (!tile) throw new Error("NOT_FOUND");
  const data: Record<string, unknown> = {};

  if (patch.label !== undefined) data.label = patch.label?.trim() || null;
  if (patch.playSound !== undefined) data.playSound = Boolean(patch.playSound);
  if (patch.startSec !== undefined) {
    if (patch.startSec === null) data.startSec = null;
    else {
      const v = Number(patch.startSec);
      if (tile.art.kind !== "video") throw new Error("NO_VIDEO");
      if (!Number.isFinite(v) || v < 0) throw new Error("INVALID_START");
      if (tile.art.durationSec != null && v >= tile.art.durationSec)
        throw new Error("INVALID_START");
      data.startSec = v;
    }
  }
  if (patch.crop !== undefined) {
    const parsed = parseArtCrop(patch.crop);
    if (!parsed.ok) throw new Error("INVALID_CROP");
    Object.assign(
      data,
      parsed.crop
        ? { cropX: parsed.crop.x, cropY: parsed.crop.y, cropW: parsed.crop.w, cropH: parsed.crop.h }
        : { cropX: null, cropY: null, cropW: null, cropH: null },
    );
  }

  if (patch.isAnswer !== undefined) {
    data.isAnswer = Boolean(patch.isAnswer);
    if (patch.isAnswer) {
      // at most one answer per round
      await prisma.pickerTile.updateMany({
        where: { roundId: tile.roundId, id: { not: tile.id } },
        data: { isAnswer: false },
      });
    }
  }

  const updated = await prisma.pickerTile.update({ where: { id: tile.id }, data });
  await touch(tile.round.projectId);
  return updated;
}

export async function deleteTile(userId: string, tileId: string) {
  const tile = await prisma.pickerTile.findFirst({
    where: { id: tileId, round: { project: { userId } } },
    include: { round: true },
  });
  if (!tile) throw new Error("NOT_FOUND");
  await prisma.pickerTile.delete({ where: { id: tile.id } });
  await renumber("pickerTile", { roundId: tile.roundId });
  return touch(tile.round.projectId);
}

export async function reorderTiles(userId: string, roundId: string, ids: string[]) {
  const round = await ownedRound(userId, roundId);
  const known = new Set(round.tiles.map((t) => t.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id)))
    throw new Error("INVALID_ORDER");
  await prisma.$transaction(
    ids.map((id, i) => prisma.pickerTile.update({ where: { id }, data: { order: i } })),
  );
  return touch(round.projectId);
}

// ---- Manual top items ----

export async function addTopItem(userId: string, projectId: string, audioArtId: string) {
  const project = await ownedProject(userId, projectId);
  if (project.kind !== "top") throw new Error("NOT_TOP");
  const config = await prisma.renderConfig.findUnique({
    where: { projectId },
    include: { items: true },
  });
  if (!config) throw new Error("NO_CONFIG");

  const art = await prisma.art.findFirst({ where: { id: audioArtId, userId } });
  // The position needs an audio source: a pool audio, or a video with sound.
  if (!art || art.kind === "image" || !art.hasAudio) throw new Error("NO_AUDIO_SOURCE");

  const item = await prisma.renderItem.create({
    data: {
      renderConfigId: config.id,
      audioArtId,
      rank: config.items.length + 1,
      clipMode: "active_snippet",
      snippetLenSec: 30,
    },
  });
  await prisma.art.update({ where: { id: audioArtId }, data: { lastUsedAt: new Date() } });
  await touch(projectId);
  return item;
}

export async function deleteTopItem(userId: string, projectId: string, itemId: string) {
  const project = await ownedProject(userId, projectId);
  const item = await prisma.renderItem.findFirst({
    where: { id: itemId, renderConfig: { projectId: project.id } },
  });
  if (!item) throw new Error("NOT_FOUND");
  await prisma.renderItem.delete({ where: { id: item.id } });
  // Compact ranks 1..N preserving order.
  const config = await prisma.renderConfig.findUnique({
    where: { projectId },
    include: { items: { orderBy: { rank: "asc" } } },
  });
  if (config) {
    await prisma.$transaction(
      config.items.map((it, i) =>
        prisma.renderItem.update({ where: { id: it.id }, data: { rank: i + 1 } }),
      ),
    );
  }
  return touch(projectId);
}

export async function reorderTopItems(userId: string, projectId: string, ids: string[]) {
  await ownedProject(userId, projectId);
  const config = await prisma.renderConfig.findUnique({
    where: { projectId },
    include: { items: true },
  });
  if (!config) throw new Error("NO_CONFIG");
  const known = new Set(config.items.map((it) => it.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id)))
    throw new Error("INVALID_ORDER");
  await prisma.$transaction(
    ids.map((id, i) => prisma.renderItem.update({ where: { id }, data: { rank: i + 1 } })),
  );
  return touch(projectId);
}

// ---- helpers ----

async function touch(projectId: string) {
  await prisma.videoProject.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });
}

/** Re-pack `order` to 0..N-1 after a delete. */
async function renumber(
  model: "pickerRound" | "pickerTile",
  where: { projectId?: string; roundId?: string },
) {
  if (model === "pickerRound") {
    const rows = await prisma.pickerRound.findMany({ where, orderBy: { order: "asc" } });
    await prisma.$transaction(
      rows.map((r, i) => prisma.pickerRound.update({ where: { id: r.id }, data: { order: i } })),
    );
  } else {
    const rows = await prisma.pickerTile.findMany({ where, orderBy: { order: "asc" } });
    await prisma.$transaction(
      rows.map((r, i) => prisma.pickerTile.update({ where: { id: r.id }, data: { order: i } })),
    );
  }
}

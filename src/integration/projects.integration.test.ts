import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { prisma } from "@/lib/db";
import { absPath, removePath, saveFile } from "@/lib/storage";
import { createArt, deleteArt } from "@/server/arts";
import {
  createProject,
  getProject,
  patchProject,
  deleteProject,
  addRound,
  patchRound,
  deleteRound,
  addTile,
  patchTile,
  deleteTile,
  reorderTiles,
  addTopItem,
  deleteTopItem,
  reorderTopItems,
} from "@/server/projects";
import { buildPickerPreviewPlan, invalidRounds } from "@/server/picker-render";
import { effectivePlaylist, setPlaylist } from "@/server/projects";
import { buildPreviewPlan, getProjectRenderConfig } from "@/server/render";

// Integration tests for phase 6 (video projects): picker CRUD + preview plan,
// manual top over the generalized render config, pool-audio sources.

const EMAIL = "integration-projects@test.local";
const EMAIL_OTHER = "integration-projects-other@test.local";

const FFMPEG = ffmpegPath as unknown as string;
function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    const err: Buffer[] = [];
    proc.stderr.on("data", (d) => err.push(d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg ${code}: ${Buffer.concat(err).toString().slice(-400)}`)),
    );
  });
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let userId: string;
let otherUserId: string;
let imageArtId: string;
let videoArtId: string; // 3s, with audio
let silentVideoArtId: string; // 2s, no audio
let audioArtId: string; // 3s mp3

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL, EMAIL_OTHER] } },
  });
  for (const u of users) await removePath(`arts/${u.id}`);
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EMAIL_OTHER] } } });
}

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "projects-it-"));
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=3",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    path.join(dir, "clip.mp4"),
  ]);
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    path.join(dir, "silent.mp4"),
  ]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=330:duration=3", path.join(dir, "tone.mp3")]);

  await cleanup();
  userId = (await prisma.user.create({ data: { email: EMAIL, passwordHash: "x" } })).id;
  otherUserId = (
    await prisma.user.create({ data: { email: EMAIL_OTHER, passwordHash: "x" } })
  ).id;

  imageArtId = (await createArt(userId, { fileName: "pic.png", data: PNG })).id;
  videoArtId = (
    await createArt(userId, { fileName: "clip.mp4", data: await readFile(path.join(dir, "clip.mp4")) })
  ).id;
  silentVideoArtId = (
    await createArt(userId, { fileName: "silent.mp4", data: await readFile(path.join(dir, "silent.mp4")) })
  ).id;
  audioArtId = (
    await createArt(userId, { fileName: "tone.mp3", data: await readFile(path.join(dir, "tone.mp3")) })
  ).id;
});

afterAll(async () => {
  await cleanup();
});

describe("pool audio", () => {
  it("probes an uploaded mp3: kind audio, duration, hasAudio, no poster", async () => {
    const art = await prisma.art.findUniqueOrThrow({ where: { id: audioArtId } });
    expect(art.kind).toBe("audio");
    expect(art.hasAudio).toBe(true);
    expect(art.durationSec).toBeGreaterThan(2.5);
    expect(art.posterPath).toBeNull();
  });
});

describe("project CRUD", () => {
  it("creates a picker with one starter round and a top with a config", async () => {
    const picker = await createProject(userId, "Мой пикер", "picker");
    const loaded = await getProject(userId, picker.id);
    expect(loaded!.rounds).toHaveLength(1);

    const top = await createProject(userId, "Мой топ", "top");
    const config = await getProjectRenderConfig(userId, top.id);
    expect(config).not.toBeNull();
    expect(config!.items).toHaveLength(0);

    await deleteProject(userId, picker.id);
    await deleteProject(userId, top.id);
  });

  it("rejects a bad kind and an empty title", async () => {
    await expect(createProject(userId, "X", "slideshow")).rejects.toThrow("BAD_KIND");
    await expect(createProject(userId, "  ", "picker")).rejects.toThrow("NO_TITLE");
  });

  it("validates defaults and backgrounds on patch", async () => {
    const p = await createProject(userId, "Настройки", "picker");
    await expect(patchProject(userId, p.id, { revealSec: 0.2 })).rejects.toThrow("BAD_REVEAL");
    await expect(patchProject(userId, p.id, { timerSec: 900 })).rejects.toThrow("BAD_TIMER");
    // audio art cannot be the visual background; image cannot be the music
    await expect(patchProject(userId, p.id, { bgArtId: audioArtId })).rejects.toThrow("BAD_BG");
    await expect(patchProject(userId, p.id, { bgMusicArtId: imageArtId })).rejects.toThrow("BAD_MUSIC");

    await patchProject(userId, p.id, {
      revealSec: 2,
      timerSec: 4,
      bgArtId: imageArtId,
      bgMusicArtId: audioArtId,
    });
    const loaded = await getProject(userId, p.id);
    expect(loaded!.bgArt!.id).toBe(imageArtId);
    expect(loaded!.bgMusicArt!.id).toBe(audioArtId);
    await deleteProject(userId, p.id);
  });

  it("foreign projects are invisible", async () => {
    const p = await createProject(userId, "Чужое", "picker");
    expect(await getProject(otherUserId, p.id)).toBeNull();
    await expect(patchProject(otherUserId, p.id, { title: "hack" })).rejects.toThrow("NOT_FOUND");
    await expect(deleteProject(otherUserId, p.id)).rejects.toThrow("NOT_FOUND");
    await deleteProject(userId, p.id);
  });
});

describe("picker rounds & tiles", () => {
  it("full round lifecycle with validations", async () => {
    const p = await createProject(userId, "Раунды", "picker");
    const loaded = await getProject(userId, p.id);
    const round0 = loaded!.rounds[0];

    await expect(patchRound(userId, round0.id, { labelsMode: "sometimes" })).rejects.toThrow("BAD_LABELS");
    await expect(patchRound(userId, round0.id, { revealSec: 0 })).rejects.toThrow("BAD_REVEAL");
    await patchRound(userId, round0.id, { prompt: " Выбери опенинг ", labelsMode: "always", revealSec: 2 });
    const after = await getProject(userId, p.id);
    expect(after!.rounds[0].prompt).toBe("Выбери опенинг");

    const r2 = await addRound(userId, p.id);
    await deleteRound(userId, round0.id);
    const renumbered = await getProject(userId, p.id);
    expect(renumbered!.rounds.map((r) => r.id)).toEqual([r2.id]);
    expect(renumbered!.rounds[0].order).toBe(0);
    await deleteProject(userId, p.id);
  });

  it("tiles: kinds, cap of 9, single answer, startSec/crop rules", async () => {
    const p = await createProject(userId, "Плитки", "picker");
    const round = (await getProject(userId, p.id))!.rounds[0];

    await expect(addTile(userId, round.id, audioArtId)).rejects.toThrow("BAD_ART");

    const t1 = await addTile(userId, round.id, imageArtId);
    const t2 = await addTile(userId, round.id, videoArtId);
    for (let i = 0; i < 7; i++) await addTile(userId, round.id, imageArtId);
    await expect(addTile(userId, round.id, imageArtId)).rejects.toThrow("TOO_MANY_TILES");

    // single isAnswer per round
    await patchTile(userId, t1.id, { isAnswer: true });
    await patchTile(userId, t2.id, { isAnswer: true });
    const tiles = (await getProject(userId, p.id))!.rounds[0].tiles;
    expect(tiles.filter((t) => t.isAnswer).map((t) => t.id)).toEqual([t2.id]);

    // startSec: only for videos, must be inside the footage
    await expect(patchTile(userId, t1.id, { startSec: 1 })).rejects.toThrow("NO_VIDEO");
    await expect(patchTile(userId, t2.id, { startSec: 99 })).rejects.toThrow("INVALID_START");
    await patchTile(userId, t2.id, { startSec: 1.5, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } });
    await expect(patchTile(userId, t2.id, { crop: { x: 2 } })).rejects.toThrow("INVALID_CROP");

    // reorder + delete renumbers
    const ids = tiles.map((t) => t.id);
    await reorderTiles(userId, round.id, [...ids].reverse());
    await expect(reorderTiles(userId, round.id, ids.slice(1))).rejects.toThrow("INVALID_ORDER");
    await deleteTile(userId, ids[0]);
    const left = (await getProject(userId, p.id))!.rounds[0].tiles;
    expect(left.map((t) => t.order)).toEqual(left.map((_, i) => i));

    await deleteProject(userId, p.id);
  });

  it("deleting a pool art removes its tiles and clears backgrounds", async () => {
    const tmp = await createArt(userId, { fileName: "tmp.png", data: PNG });
    const p = await createProject(userId, "Каскад", "picker");
    const round = (await getProject(userId, p.id))!.rounds[0];
    await addTile(userId, round.id, tmp.id);
    await patchProject(userId, p.id, { bgArtId: tmp.id });

    await deleteArt(userId, tmp.id);
    const loaded = await getProject(userId, p.id);
    expect(loaded!.rounds[0].tiles).toHaveLength(0);
    expect(loaded!.bgArt).toBeNull();
    await deleteProject(userId, p.id);
  });
});

describe("picker preview plan", () => {
  it("builds the plan with inheritance, skipping empty rounds", async () => {
    const p = await createProject(userId, "План", "picker");
    await patchProject(userId, p.id, { revealSec: 2, timerSec: 3, bgMusicArtId: audioArtId });
    const round = (await getProject(userId, p.id))!.rounds[0];
    await patchRound(userId, round.id, { prompt: "Выбери OST" });
    await addTile(userId, round.id, videoArtId); // 3s, sounded
    await addTile(userId, round.id, imageArtId);
    await addRound(userId, p.id); // stays empty -> skipped

    const loaded = await getProject(userId, p.id);
    expect(invalidRounds(loaded!)).toEqual([2]);
    const plan = buildPickerPreviewPlan(loaded!);
    expect(plan.rounds).toHaveLength(1);
    const r = plan.rounds[0];
    expect(r.prompt).toBe("Выбери OST");
    expect(r.timerSec).toBe(3);
    // sounded video tile: own sound window + ducking, refs are /api URLs
    expect(r.tiles[0].sound).not.toBeNull();
    expect(r.tiles[0].visual.path).toBe(`/api/arts/${videoArtId}`);
    expect(r.bgMusic!.ref).toBe(`/api/arts/${audioArtId}`);
    expect(r.bgMusic!.duckWindows).toHaveLength(1);
    await deleteProject(userId, p.id);
  });
});

describe("manual top", () => {
  it("positions from pool audio/video; images and silent videos rejected", async () => {
    const p = await createProject(userId, "Ручной топ", "top");

    await expect(addTopItem(userId, p.id, imageArtId)).rejects.toThrow("NO_AUDIO_SOURCE");
    await expect(addTopItem(userId, p.id, silentVideoArtId)).rejects.toThrow("NO_AUDIO_SOURCE");

    const pos1 = await addTopItem(userId, p.id, audioArtId);
    const pos2 = await addTopItem(userId, p.id, videoArtId);
    let config = await getProjectRenderConfig(userId, p.id);
    expect(config!.items.map((it) => it.rank)).toEqual([1, 2]);

    // preview plan: the video-sourced position shows its own footage synced
    const plan = buildPreviewPlan(config!);
    const videoSeg = plan.segments.find((s) => s.audioPath === `/api/arts/${videoArtId}`);
    expect(videoSeg).toBeTruthy();
    expect(videoSeg!.visual.kind).toBe("video");
    // audio-sourced position has no visual by default -> placeholder
    const audioSeg = plan.segments.find((s) => s.audioPath === `/api/arts/${audioArtId}`);
    expect(audioSeg!.visual.kind).toBe("none");
    // clip clamped to the 3s source
    expect(videoSeg!.clipSec).toBeLessThanOrEqual(3.01);

    // reorder + delete compacts ranks
    await reorderTopItems(userId, p.id, [pos2.id, pos1.id]);
    config = await getProjectRenderConfig(userId, p.id);
    expect(config!.items[0].id).toBe(pos2.id);
    await deleteTopItem(userId, p.id, pos2.id);
    config = await getProjectRenderConfig(userId, p.id);
    expect(config!.items.map((it) => it.rank)).toEqual([1]);

    await deleteProject(userId, p.id);
  });

  it("tiles/positions are rejected for the wrong project kind", async () => {
    const top = await createProject(userId, "Топ", "top");
    const picker = await createProject(userId, "Пикер", "picker");
    await expect(addRound(userId, top.id)).rejects.toThrow("NOT_PICKER");
    await expect(addTopItem(userId, picker.id, audioArtId)).rejects.toThrow("NOT_TOP");
    await deleteProject(userId, top.id);
    await deleteProject(userId, picker.id);
  });
});

describe("background-music playlist", () => {
  it("legacy bgMusicArtId acts as a one-track playlist until a real one is saved", async () => {
    const p = await createProject(userId, "Плейлист-legacy", "picker");
    await patchProject(userId, p.id, { bgMusicArtId: audioArtId });
    let loaded = await getProject(userId, p.id);
    expect(effectivePlaylist(loaded!).map((a) => a.id)).toEqual([audioArtId]);

    // saving an explicit playlist clears the legacy field
    await setPlaylist(userId, p.id, [audioArtId, audioArtId]);
    loaded = await getProject(userId, p.id);
    expect(loaded!.bgMusicArtId).toBeNull();
    expect(effectivePlaylist(loaded!).map((a) => a.id)).toEqual([audioArtId, audioArtId]);
    await deleteProject(userId, p.id);
  });

  it("rejects non-audio tracks and wrong project kinds", async () => {
    const p = await createProject(userId, "Плейлист-валид", "picker");
    await expect(setPlaylist(userId, p.id, [imageArtId])).rejects.toThrow("BAD_MUSIC");
    await expect(setPlaylist(userId, p.id, [silentVideoArtId])).rejects.toThrow("BAD_MUSIC");
    await expect(setPlaylist(otherUserId, p.id, [audioArtId])).rejects.toThrow("NOT_FOUND");
    const top = await createProject(userId, "Топ", "top");
    await expect(setPlaylist(userId, top.id, [audioArtId])).rejects.toThrow("NOT_PICKER");
    await deleteProject(userId, p.id);
    await deleteProject(userId, top.id);
  });

  it("preview plan carries continuous music cues, mute windows and global ducks", async () => {
    const p = await createProject(userId, "Плейлист-план", "picker");
    await patchProject(userId, p.id, { revealSec: 2, timerSec: 3 });
    await setPlaylist(userId, p.id, [audioArtId]); // 3s track -> loops
    const r1 = (await getProject(userId, p.id))!.rounds[0];
    await addTile(userId, r1.id, videoArtId); // sounded tile -> duck window
    await addTile(userId, r1.id, imageArtId);
    const r2 = await addRound(userId, p.id);
    await patchRound(userId, r2.id, { bgMusicArtId: audioArtId }); // override round
    await addTile(userId, r2.id, imageArtId);
    await addTile(userId, r2.id, imageArtId);

    const plan = buildPickerPreviewPlan((await getProject(userId, p.id))!);
    expect(plan.music).not.toBeNull();
    const music = plan.music!;
    // cues cover the whole video, looping the 3s track with crossfades
    expect(music.cues.length).toBeGreaterThan(2);
    const last = music.cues[music.cues.length - 1];
    expect(last.fromSec + last.durationSec).toBeGreaterThanOrEqual(plan.durationSec);
    expect(music.cues.every((c) => c.ref === `/api/arts/${audioArtId}`)).toBe(true);
    // the override round mutes the playlist for exactly its span
    const round2 = plan.rounds[1];
    expect(music.muteWindows).toEqual([{ fromSec: round2.startSec, toSec: round2.endSec }]);
    // global ducks come only from the non-override round
    expect(music.duckWindows).toEqual(plan.rounds[0].duckWindows);
    expect(music.duckWindows).toHaveLength(1);
    await deleteProject(userId, p.id);
  });
});

describe("phase 11: orientation + fitMode", () => {
  it("patchProject validates and stores tileOrientation", async () => {
    const p = await createProject(userId, "Ориентация проекта", "picker");
    await patchProject(userId, p.id, { tileOrientation: "portrait" });
    const fresh = await getProject(userId, p.id);
    expect(fresh!.tileOrientation).toBe("portrait");
    await expect(patchProject(userId, p.id, { tileOrientation: "diagonal" })).rejects.toThrow(
      "BAD_ORIENTATION",
    );
    await deleteProject(userId, p.id);
  });

  it("patchRound override + reset (null) works", async () => {
    const p = await createProject(userId, "Ориентация раунда", "picker");
    const r = (await getProject(userId, p.id))!.rounds[0];

    await patchRound(userId, r.id, { tileOrientation: "portrait" });
    let loaded = await getProject(userId, p.id);
    expect(loaded!.rounds[0].tileOrientation).toBe("portrait");

    await patchRound(userId, r.id, { tileOrientation: null });
    loaded = await getProject(userId, p.id);
    expect(loaded!.rounds[0].tileOrientation).toBeNull();
    await deleteProject(userId, p.id);
  });

  it("patchTile validates and stores fitMode", async () => {
    const p = await createProject(userId, "FitMode", "picker");
    const round = (await getProject(userId, p.id))!.rounds[0];
    const tile = await addTile(userId, round.id, imageArtId);

    await patchTile(userId, tile.id, { fitMode: "contain" });
    let loaded = await getProject(userId, p.id);
    expect(loaded!.rounds[0].tiles[0].fitMode).toBe("contain");

    await expect(patchTile(userId, tile.id, { fitMode: "squish" })).rejects.toThrow("BAD_FIT");
    await deleteProject(userId, p.id);
  });

  it("changing a round's effective orientation resets its tiles' crops", async () => {
    const p = await createProject(userId, "Кроп сброс раунд", "picker"); // landscape by default
    const round = (await getProject(userId, p.id))!.rounds[0];
    const tile = await addTile(userId, round.id, imageArtId);

    await patchTile(userId, tile.id, { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    await patchRound(userId, round.id, { tileOrientation: "portrait" });
    const t = await prisma.pickerTile.findUniqueOrThrow({ where: { id: tile.id } });
    expect(t.cropX).toBeNull();
    expect(t.cropY).toBeNull();
    expect(t.cropW).toBeNull();
    expect(t.cropH).toBeNull();
    await deleteProject(userId, p.id);
  });

  it("changing project orientation resets crops of tiles in rounds without an override", async () => {
    const p = await createProject(userId, "Кроп сброс проект", "picker"); // landscape by default
    const round = (await getProject(userId, p.id))!.rounds[0];
    const tile = await addTile(userId, round.id, imageArtId);

    await patchTile(userId, tile.id, { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    await patchProject(userId, p.id, { tileOrientation: "portrait" });
    const t = await prisma.pickerTile.findUniqueOrThrow({ where: { id: tile.id } });
    expect(t.cropX).toBeNull();
    expect(t.cropW).toBeNull();
    await deleteProject(userId, p.id);
  });

  it("keeps crops of tiles in override-carrying rounds when project orientation flips", async () => {
    const p = await createProject(userId, "Кроп сохранён переопределение", "picker"); // landscape by default
    const round = (await getProject(userId, p.id))!.rounds[0];

    // Give the round an explicit override matching the project default
    await patchRound(userId, round.id, { tileOrientation: "landscape" });
    const tile = await addTile(userId, round.id, imageArtId);

    await patchTile(userId, tile.id, { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    // Flip the project orientation; the round's effective orientation stays the same due to override
    await patchProject(userId, p.id, { tileOrientation: "portrait" });
    const t = await prisma.pickerTile.findUniqueOrThrow({ where: { id: tile.id } });
    // Crop must be preserved because the round's effective orientation didn't change
    expect(t.cropX).toBe(0);
    expect(t.cropY).toBe(0);
    expect(t.cropW).toBe(0.5);
    expect(t.cropH).toBe(0.5);
    await deleteProject(userId, p.id);
  });
});

describe("project deletion", () => {
  it("removes render outputs from disk", async () => {
    const p = await createProject(userId, "С джобой", "picker");
    const outRel = await saveFile(path.join("renders", "project-it.mp4"), Buffer.alloc(7));
    const job = await prisma.renderJob.create({
      data: { projectId: p.id, status: "done", outputPath: outRel },
    });
    expect(existsSync(absPath(outRel))).toBe(true);
    await deleteProject(userId, p.id);
    expect(existsSync(absPath(outRel))).toBe(false);
    expect(await prisma.renderJob.findUnique({ where: { id: job.id } })).toBeNull();
  });
});

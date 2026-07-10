import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/db";
import { absPath, removePath } from "@/lib/storage";
import { extractTracksFromZip } from "@/lib/upload";
import { probeMediaInfo, findActiveSnippet } from "@/lib/audio";
import { createArt, deleteArt, listArts } from "@/server/arts";
import { patchRenderItem } from "@/server/render-items";
import { buildPreviewPlan, getRenderConfig } from "@/server/render";

// Integration tests for video support (spec 04) on the real Prisma schema:
// pool uploads with probing/posters, per-position audio-source and footage
// rules, preview-plan wiring, and mixed-ZIP extraction. Media fixtures are
// generated with the bundled ffmpeg.

const EMAIL = "integration-video@test.local";

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

let dir: string;
let userId: string;
let audioItemId: string; // position whose track is audio
let videoItemId: string; // position whose track is video (soundless footage)
let tournamentId: string;
let videoWithAudio: Buffer; // 4s clip with a sine audio stream
let videoSilent: Buffer; // 2s clip without any audio stream
let mp3: Buffer;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: EMAIL } });
  for (const u of users) await removePath(`arts/${u.id}`);
  const tournaments = await prisma.tournament.findMany({
    where: { user: { email: EMAIL } },
  });
  for (const t of tournaments) await removePath(`tournaments/${t.id}`);
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "video-it-"));
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    path.join(dir, "with-audio.mp4"),
  ]);
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    path.join(dir, "silent.mp4"),
  ]);
  await ffmpeg([
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    path.join(dir, "tone.mp3"),
  ]);
  videoWithAudio = await readFile(path.join(dir, "with-audio.mp4"));
  videoSilent = await readFile(path.join(dir, "silent.mp4"));
  mp3 = await readFile(path.join(dir, "tone.mp3"));

  await cleanup();
  const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: "x" } });
  userId = user.id;

  // Tournament with one audio track and one soundless video track + config.
  const tournament = await prisma.tournament.create({
    data: { userId, title: "Video IT", scheme: "merge", status: "completed", topSize: 2 },
  });
  tournamentId = tournament.id;
  const audioTrack = await prisma.track.create({
    data: {
      tournamentId: tournament.id,
      title: "Tone",
      kind: "audio",
      filePath: `tournaments/${tournament.id}/tone.mp3`,
      durationSec: 3,
      order: 0,
    },
  });
  const videoTrack = await prisma.track.create({
    data: {
      tournamentId: tournament.id,
      title: "Opening",
      kind: "video",
      filePath: `tournaments/${tournament.id}/silent.mp4`,
      durationSec: 2,
      order: 1,
    },
  });
  const { saveFile } = await import("@/lib/storage");
  await saveFile(audioTrack.filePath, mp3);
  await saveFile(videoTrack.filePath, videoSilent);
  const config = await prisma.renderConfig.create({
    data: {
      tournamentId: tournament.id,
      items: {
        create: [
          { trackId: audioTrack.id, rank: 1 },
          { trackId: videoTrack.id, rank: 2 },
        ],
      },
    },
    include: { items: { orderBy: { rank: "asc" } } },
  });
  audioItemId = config.items[0].id;
  videoItemId = config.items[1].id;
}, 120_000);

afterAll(async () => {
  await cleanup();
  await rm(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("pool uploads", () => {
  it("stores a video with kind, duration, audio flag and a poster frame", async () => {
    const art = await createArt(userId, { fileName: "Opening.mp4", data: videoWithAudio });
    expect(art.kind).toBe("video");
    expect(art.hasAudio).toBe(true);
    expect(art.durationSec).toBeGreaterThan(3.5);
    expect(art.posterPath).toBeTruthy();
    expect(existsSync(absPath(art.filePath))).toBe(true);
    expect(existsSync(absPath(art.posterPath!))).toBe(true);
  });

  it("marks a soundless video as hasAudio=false", async () => {
    const art = await createArt(userId, { fileName: "Ambient.mp4", data: videoSilent });
    expect(art.kind).toBe("video");
    expect(art.hasAudio).toBe(false);
  });

  it("rejects unsupported video containers", async () => {
    await expect(
      createArt(userId, { fileName: "movie.mkv", data: videoSilent }),
    ).rejects.toThrow("BAD_EXT");
  });

  it("filters the pool by kind", async () => {
    await createArt(userId, {
      fileName: "poster.png",
      data: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    const videos = await listArts(userId, { kind: "video" });
    expect(videos.arts.length).toBeGreaterThanOrEqual(2);
    expect(videos.arts.every((a) => a.kind === "video")).toBe(true);
    const images = await listArts(userId, { kind: "image" });
    expect(images.arts.every((a) => a.kind === "image")).toBe(true);
  });
});

describe("position audio source and footage offset", () => {
  it("attaching a video starts from defaults (track audio, no crop, offset 0)", async () => {
    const art = await createArt(userId, { fileName: "swap.mp4", data: videoWithAudio });
    await patchRenderItem(userId, audioItemId, { artId: art.id });
    const item = await prisma.renderItem.findUnique({ where: { id: audioItemId } });
    expect(item?.audioSource).toBe("track");
    expect(item?.mediaStartSec).toBeNull();
    expect(item?.artCropX).toBeNull();
  });

  it("switches audio to the pool video and resets the RMS cache", async () => {
    await prisma.renderItem.update({
      where: { id: audioItemId },
      data: { resolvedStartSec: 1.5 },
    });
    await patchRenderItem(userId, audioItemId, { audioSource: "media" });
    const item = await prisma.renderItem.findUnique({ where: { id: audioItemId } });
    expect(item?.audioSource).toBe("media");
    expect(item?.resolvedStartSec).toBeNull();
  });

  it("rejects media audio on a soundless video, an image, and an empty position", async () => {
    const silent = await createArt(userId, { fileName: "no-sound.mp4", data: videoSilent });
    await patchRenderItem(userId, videoItemId, { artId: silent.id });
    await expect(
      patchRenderItem(userId, videoItemId, { audioSource: "media" }),
    ).rejects.toThrow("NO_MEDIA_AUDIO");

    await patchRenderItem(userId, videoItemId, { artId: null });
    await expect(
      patchRenderItem(userId, videoItemId, { audioSource: "media" }),
    ).rejects.toThrow("NO_MEDIA_AUDIO");

    await expect(
      patchRenderItem(userId, videoItemId, { audioSource: "both" }),
    ).rejects.toThrow("INVALID_AUDIO_SOURCE");
  });

  it("validates the footage start offset against the video duration", async () => {
    const art = await createArt(userId, { fileName: "offset.mp4", data: videoWithAudio });
    await patchRenderItem(userId, audioItemId, { artId: art.id });

    await patchRenderItem(userId, audioItemId, { mediaStartSec: 1.5 });
    let item = await prisma.renderItem.findUnique({ where: { id: audioItemId } });
    expect(item?.mediaStartSec).toBe(1.5);

    await patchRenderItem(userId, audioItemId, { mediaStartSec: null });
    item = await prisma.renderItem.findUnique({ where: { id: audioItemId } });
    expect(item?.mediaStartSec).toBeNull();

    await expect(
      patchRenderItem(userId, audioItemId, { mediaStartSec: -1 }),
    ).rejects.toThrow("INVALID_START");
    await expect(
      patchRenderItem(userId, audioItemId, { mediaStartSec: 999 }),
    ).rejects.toThrow("INVALID_START");
  });

  it("rejects a footage offset when the visual is not a video", async () => {
    const png = await listArts(userId, { kind: "image" });
    await patchRenderItem(userId, audioItemId, { artId: png.arts[0].id });
    await expect(
      patchRenderItem(userId, audioItemId, { mediaStartSec: 1 }),
    ).rejects.toThrow("NO_VIDEO");
  });

  it("changing the media resets crop, offset and audio source", async () => {
    const a = await createArt(userId, { fileName: "first.mp4", data: videoWithAudio });
    const b = await createArt(userId, { fileName: "second.mp4", data: videoWithAudio });
    await patchRenderItem(userId, audioItemId, { artId: a.id });
    await patchRenderItem(userId, audioItemId, {
      audioSource: "media",
      mediaStartSec: 1,
      artCrop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    });

    await patchRenderItem(userId, audioItemId, { artId: b.id });
    const item = await prisma.renderItem.findUnique({ where: { id: audioItemId } });
    expect(item?.artId).toBe(b.id);
    expect(item?.audioSource).toBe("track");
    expect(item?.mediaStartSec).toBeNull();
    expect(item?.artCropX).toBeNull();
  });

  it("allows cropping a video track's own footage without an attached media", async () => {
    await patchRenderItem(userId, videoItemId, { artId: null });
    await patchRenderItem(userId, videoItemId, {
      artCrop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });
    const item = await prisma.renderItem.findUnique({ where: { id: videoItemId } });
    expect(item?.artCropW).toBe(0.5);
    await patchRenderItem(userId, videoItemId, { artCrop: null });
  });

  it("deleting a used video frees the position back to defaults and removes the poster", async () => {
    const art = await createArt(userId, { fileName: "doomed.mp4", data: videoWithAudio });
    await patchRenderItem(userId, audioItemId, { artId: art.id });
    await patchRenderItem(userId, audioItemId, {
      audioSource: "media",
      mediaStartSec: 0.5,
      artCrop: { x: 0, y: 0, w: 1, h: 1 },
    });

    await deleteArt(userId, art.id);

    const item = await prisma.renderItem.findUnique({ where: { id: audioItemId } });
    expect(item?.artId).toBeNull();
    expect(item?.audioSource).toBe("track");
    expect(item?.mediaStartSec).toBeNull();
    expect(item?.artCropX).toBeNull();
    expect(existsSync(absPath(art.filePath))).toBe(false);
    expect(existsSync(absPath(art.posterPath!))).toBe(false);
  });
});

describe("preview plan wiring", () => {
  it("a video track shows its own footage synced to its audio clip", async () => {
    await patchRenderItem(userId, videoItemId, { artId: null });
    const config = await getRenderConfig(userId, tournamentId);
    const plan = buildPreviewPlan(config!);
    const seg = plan.segments.find((s) => s.rank === 2)!;
    expect(seg.visual.kind).toBe("video");
    expect(seg.visual.path).toContain("/api/tracks/");
    expect(seg.visual.loopSec).toBeNull();
    // soundless 2s footage: the segment is clamped to the source length
    expect(seg.clipSec).toBe(2);
  });

  it("a pool video as visual-only loops from its offset while the track plays", async () => {
    const art = await createArt(userId, { fileName: "loop-me.mp4", data: videoWithAudio });
    await patchRenderItem(userId, audioItemId, { artId: art.id });
    await patchRenderItem(userId, audioItemId, { mediaStartSec: 1 });
    const config = await getRenderConfig(userId, tournamentId);
    const plan = buildPreviewPlan(config!);
    const seg = plan.segments.find((s) => s.rank === 1)!;
    expect(seg.audioPath).toContain("/api/tracks/");
    expect(seg.visual.kind).toBe("video");
    expect(seg.visual.startSec).toBe(1);
    // 3s audio track, ~4s footage minus offset 1s -> footage covers, no loop
    expect(seg.visual.loopSec).toBeNull();
  });

  it("swapping the audio to the pool video moves both audio and footage to it", async () => {
    await patchRenderItem(userId, audioItemId, { audioSource: "media" });
    const config = await getRenderConfig(userId, tournamentId);
    const plan = buildPreviewPlan(config!);
    const seg = plan.segments.find((s) => s.rank === 1)!;
    expect(seg.audioPath).toContain("/api/arts/");
    expect(seg.visual.path).toContain("/api/arts/");
    expect(seg.visual.loopSec).toBeNull();
    // fragment length is clamped by the video's own duration (~4s)
    expect(seg.clipSec).toBeLessThanOrEqual(4.1);
  });

  it("an image over a video track keeps the track's audio (overlay case)", async () => {
    const images = await listArts(userId, { kind: "image" });
    await patchRenderItem(userId, videoItemId, { artId: images.arts[0].id });
    const config = await getRenderConfig(userId, tournamentId);
    const plan = buildPreviewPlan(config!);
    const seg = plan.segments.find((s) => s.rank === 2)!;
    expect(seg.visual.kind).toBe("image");
    expect(seg.audioPath).toContain("/api/tracks/");
  });
});

describe("media probing and extraction", () => {
  it("probeMediaInfo reports streams correctly", async () => {
    expect(await probeMediaInfo(path.join(dir, "with-audio.mp4"))).toMatchObject({
      hasAudio: true,
      hasVideo: true,
    });
    expect(await probeMediaInfo(path.join(dir, "silent.mp4"))).toMatchObject({
      hasAudio: false,
      hasVideo: true,
    });
    const audio = await probeMediaInfo(path.join(dir, "tone.mp3"));
    expect(audio.hasAudio).toBe(true);
    expect(audio.hasVideo).toBe(false);
  });

  it("RMS snippet search fails gracefully on a soundless video", async () => {
    await expect(findActiveSnippet(path.join(dir, "silent.mp4"), 1)).rejects.toThrow();
  });

  it("extracts a mixed ZIP with per-file kinds and filename titles for video", async () => {
    const zip = new AdmZip();
    zip.addFile("music/tone.mp3", mp3);
    zip.addFile("videos/Opening 1.mp4", videoWithAudio);
    zip.addFile("videos/ignored.mkv", videoSilent);
    zip.addFile("__MACOSX/._junk.mp4", Buffer.from("junk"));
    const tracks = await extractTracksFromZip(zip.toBuffer());

    // stable order by archive path: music/ before videos/
    expect(tracks.map((t) => [t.title, t.kind])).toEqual([
      ["tone", "audio"],
      ["Opening 1", "video"],
    ]);
    const video = tracks.find((t) => t.kind === "video")!;
    expect(video.durationSec).toBeGreaterThan(3);
  });
});

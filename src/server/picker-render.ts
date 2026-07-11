import "server-only";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { absPath, renderOutputPath } from "@/lib/storage";
import { clipAudio, clipVideo, writeTick } from "@/lib/audio";
import { cropFromColumns } from "@/lib/domain/art-crop";
import {
  buildPickerPlan,
  type LabelsMode,
  type PickerDefaults,
  type PlanRoundInput,
  type PlanTileInput,
} from "@/lib/domain/picker-plan";
import type { LoadedProject } from "@/server/projects";

// Picker preview plan + headless render pipeline (mirrors render.ts for tops).

type LoadedRound = LoadedProject["rounds"][number];
type LoadedTile = LoadedRound["tiles"][number];
type ArtRef = NonNullable<LoadedRound["bgArt"]>;

export const TICK_REL = path.join("assets", "tick.wav");

/** Generate the countdown tick once; returns the storage-relative path. */
export async function ensureTickAsset(): Promise<string> {
  const abs = absPath(TICK_REL);
  if (!existsSync(abs)) {
    await mkdir(path.dirname(abs), { recursive: true });
    await writeTick(abs);
  }
  return TICK_REL;
}

function defaults(project: LoadedProject): PickerDefaults {
  return {
    revealSec: project.revealSec,
    hideAfterReveal: project.hideAfterReveal,
    timerSec: project.timerSec,
    tickSound: project.tickSound,
  };
}

function tileCrop(t: LoadedTile) {
  return cropFromColumns(t.cropX, t.cropY, t.cropW, t.cropH);
}

/** Effective backgrounds of a round (round override -> project default). */
function roundArts(project: LoadedProject, round: LoadedRound) {
  return {
    bgArt: round.bgArt ?? project.bgArt,
    bgMusicArt: round.bgMusicArt ?? project.bgMusicArt,
  };
}

function urlBg(art: ArtRef | null) {
  if (!art || (art.kind !== "image" && art.kind !== "video")) return null;
  return {
    kind: art.kind as "image" | "video",
    ref: `/api/arts/${art.id}`,
    durationSec: art.durationSec,
  };
}

/** Preview plan over /api URLs for the in-browser Player. */
export function buildPickerPreviewPlan(project: LoadedProject) {
  const rounds: PlanRoundInput[] = project.rounds.map((round) => {
    const { bgArt, bgMusicArt } = roundArts(project, round);
    return {
      prompt: round.prompt,
      showPrompt: round.showPrompt,
      labelsMode: round.labelsMode as LabelsMode,
      revealSec: round.revealSec,
      hideAfterReveal: round.hideAfterReveal,
      timerSec: round.timerSec,
      bg: urlBg(bgArt),
      bgMusic: bgMusicArt
        ? { ref: `/api/arts/${bgMusicArt.id}`, durationSec: bgMusicArt.durationSec }
        : null,
      tiles: round.tiles.map((t) => ({
        media: {
          kind: t.art.kind as "image" | "video",
          ref: `/api/arts/${t.artId}`,
          posterRef: t.art.posterPath ? `/api/arts/${t.artId}?poster=1` : null,
          durationSec: t.art.durationSec,
          hasAudio: t.art.hasAudio,
        },
        crop: tileCrop(t),
        startSec: t.startSec,
        label: t.label,
        isAnswer: t.isAnswer,
        playSound: t.playSound,
      })),
    };
  });
  return buildPickerPlan(defaults(project), rounds);
}

/** Rounds must have 2..9 tiles to be renderable; returns 1-based bad indexes. */
export function invalidRounds(project: LoadedProject): number[] {
  return project.rounds
    .map((r, i) => ({ n: i + 1, count: r.tiles.length }))
    .filter((r) => r.count < 2)
    .map((r) => r.n);
}

export async function startPickerRenderJob(userId: string, projectId: string) {
  const project = await prisma.videoProject.findFirst({
    where: { id: projectId, userId, kind: "picker" },
    include: { rounds: { include: { tiles: true } } },
  });
  if (!project) throw new Error("NOT_FOUND");
  if (project.rounds.length === 0 || project.rounds.every((r) => r.tiles.length === 0))
    throw new Error("EMPTY_PROJECT");
  if (project.rounds.some((r) => r.tiles.length === 1)) throw new Error("ROUND_TOO_SMALL");

  const job = await prisma.renderJob.create({
    data: { projectId, status: "queued", progress: 0 },
  });
  void runPickerRender(job.id).catch(async (err) => {
    await prisma.renderJob.update({
      where: { id: job.id },
      data: { status: "failed", error: String((err as Error)?.message ?? err) },
    });
  });
  return job.id;
}

async function setProgress(jobId: string, progress: number) {
  await prisma.renderJob.update({ where: { id: jobId }, data: { progress } });
}

async function runPickerRender(jobId: string): Promise<void> {
  const job = await prisma.renderJob.findUnique({ where: { id: jobId } });
  if (!job?.projectId) return;
  await prisma.renderJob.update({
    where: { id: jobId },
    data: { status: "running", progress: 0.02 },
  });

  const project = await prisma.videoProject.findFirst({
    where: { id: job.projectId },
    include: {
      bgArt: true,
      bgMusicArt: true,
      rounds: {
        orderBy: { order: "asc" },
        include: {
          bgArt: true,
          bgMusicArt: true,
          tiles: { orderBy: { order: "asc" }, include: { art: true } },
        },
      },
    },
  });
  if (!project) throw new Error("NOT_FOUND");

  const publicDir = absPath(path.join("renders", "tmp", jobId, "public"));
  await mkdir(publicDir, { recursive: true });

  // Tick sample
  const tickRel = await ensureTickAsset();
  await copyFile(absPath(tickRel), path.join(publicDir, "tick.wav"));

  // Pre-render the plan once over original media to learn each tile's exact
  // footage/sound windows, then cut assets and rebuild the plan over basenames.
  const roundsWithTiles = project.rounds.filter((r) => r.tiles.length > 0);
  const total = roundsWithTiles.reduce((s, r) => s + r.tiles.length, 0) || 1;
  let done = 0;

  const roundInputs: PlanRoundInput[] = [];
  for (let ri = 0; ri < project.rounds.length; ri++) {
    const round = project.rounds[ri];
    if (round.tiles.length === 0) continue;
    const revealSec = round.revealSec ?? project.revealSec;
    const { bgArt, bgMusicArt } = roundArts(project as LoadedProject, round);

    // Background: copied as-is (looped in the composition).
    let bg: PlanRoundInput["bg"] = null;
    if (bgArt && (bgArt.kind === "image" || bgArt.kind === "video")) {
      const base = `bg-${ri}${path.extname(bgArt.filePath) || ".jpg"}`;
      await copyFile(absPath(bgArt.filePath), path.join(publicDir, base));
      bg = { kind: bgArt.kind as "image" | "video", ref: base, durationSec: bgArt.durationSec };
    }

    // Round music: clipped to the round's worst-case length, AAC for playback.
    let bgMusic: PlanRoundInput["bgMusic"] = null;
    if (bgMusicArt) {
      const base = `music-${ri}.aac`;
      const roundLen =
        round.tiles.length * revealSec + (round.timerSec ?? project.timerSec) + 10;
      const cut = Math.min(
        roundLen,
        bgMusicArt.durationSec ?? roundLen,
      );
      await clipAudio(absPath(bgMusicArt.filePath), 0, cut, path.join(publicDir, base));
      bgMusic = { ref: base, durationSec: cut };
    }

    const tiles: PlanTileInput[] = [];
    for (let ti = 0; ti < round.tiles.length; ti++) {
      const tile = round.tiles[ti];
      const art = tile.art;
      const key = `tile-${ri}-${ti}`;
      let media: PlanTileInput["media"];

      if (art.kind === "image") {
        const base = `${key}${path.extname(art.filePath) || ".jpg"}`;
        await copyFile(absPath(art.filePath), path.join(publicDir, base));
        media = { kind: "image", ref: base, posterRef: null, durationSec: null, hasAudio: false };
      } else {
        // Cut the used footage window [startSec, startSec+min(reveal, available)].
        const start = Math.max(0, tile.startSec ?? 0);
        const availRaw = art.durationSec != null ? art.durationSec - start : revealSec;
        const effStart = availRaw > 0.05 ? start : 0; // stale offset -> whole footage
        const avail =
          art.durationSec != null ? Math.max(0.2, art.durationSec - effStart) : revealSec;
        const cutLen = Math.min(revealSec, avail);
        const base = `${key}.mp4`;
        await clipVideo(absPath(art.filePath), effStart, cutLen, path.join(publicDir, base));

        let posterRef: string | null = null;
        if (art.posterPath) {
          posterRef = `${key}-poster.jpg`;
          await copyFile(absPath(art.posterPath), path.join(publicDir, posterRef));
        }
        // The pre-clipped file starts at 0 and lasts cutLen.
        media = {
          kind: "video",
          ref: base,
          posterRef,
          durationSec: cutLen,
          hasAudio: art.hasAudio,
        };
        // Tile sound: a separate AAC clip of the same window (footage is muted).
        if (tile.playSound && art.hasAudio) {
          await clipAudio(
            absPath(art.filePath),
            effStart,
            cutLen,
            path.join(publicDir, `${key}.aac`),
          );
        }
      }

      tiles.push({
        media,
        crop: tileCrop(tile),
        startSec: 0, // already applied by the pre-clip
        label: tile.label,
        isAnswer: tile.isAnswer,
        playSound: tile.playSound,
      });
      done++;
      await setProgress(jobId, 0.05 + (0.4 * done) / total);
    }

    roundInputs.push({
      prompt: round.prompt,
      showPrompt: round.showPrompt,
      labelsMode: round.labelsMode as LabelsMode,
      revealSec: round.revealSec,
      hideAfterReveal: round.hideAfterReveal,
      timerSec: round.timerSec,
      bg,
      bgMusic,
      tiles,
    });
  }

  const plan = buildPickerPlan(defaults(project as LoadedProject), roundInputs);
  // Swap each sounded tile's audio ref to its pre-clipped AAC.
  for (const r of plan.rounds) {
    for (const t of r.tiles) {
      if (t.sound) t.sound = { ...t.sound, ref: t.visual.path!.replace(/\.mp4$/, ".aac"), startSec: 0 };
    }
  }

  const { bundle } = await import("@remotion/bundler");
  const { selectComposition, renderMedia } = await import("@remotion/renderer");

  const serveUrl = await bundle({
    entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
    publicDir,
    webpackOverride: (cfg) => ({
      ...cfg,
      resolve: {
        ...cfg.resolve,
        alias: { ...(cfg.resolve?.alias ?? {}), "@": path.join(process.cwd(), "src") },
      },
    }),
  });

  const inputProps = { plan, assetMode: "static" as const, tickSrc: "tick.wav" };
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
  const chromeMode = "chrome-for-testing" as const;
  const composition = await selectComposition({
    serveUrl,
    id: "Picker",
    inputProps,
    browserExecutable,
    chromeMode,
  });

  const outputRel = renderOutputPath(jobId);
  const outputLocation = absPath(outputRel);
  await mkdir(path.dirname(outputLocation), { recursive: true });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    browserExecutable,
    chromeMode,
    onProgress: ({ progress }) => {
      void setProgress(jobId, 0.45 + 0.55 * progress);
    },
  });

  await prisma.renderJob.update({
    where: { id: jobId },
    data: { status: "done", progress: 1, outputPath: outputRel },
  });
}

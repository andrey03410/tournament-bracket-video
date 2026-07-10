import "server-only";
import path from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { absPath, renderOutputPath, STORAGE_ROOT } from "@/lib/storage";
import { clipAudio, findActiveSnippet, probeDurationSec } from "@/lib/audio";
import {
  assemblePlanItems,
  resolveClipSec,
  type AssembleItem,
  type ClipMode,
} from "@/lib/render-assemble";
import { buildVideoPlan, type DisplayOrder } from "@/lib/domain/video-plan";
import { cropFromColumns } from "@/lib/domain/art-crop";

/** Create a default render config + items (top-N) for a completed tournament. */
export async function ensureRenderConfig(userId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, userId },
    include: { rankings: { orderBy: { rank: "asc" } }, renderConfig: true },
  });
  if (!tournament) throw new Error("NOT_FOUND");
  if (tournament.status !== "completed") throw new Error("NOT_COMPLETED");
  if (tournament.renderConfig) return tournament.renderConfig.id;

  const topSize = tournament.topSize ?? tournament.rankings.length;
  const top = tournament.rankings.filter((r) => r.rank <= topSize);

  const config = await prisma.renderConfig.create({
    data: {
      tournamentId,
      introText: tournament.title,
      outroText: "Спасибо за просмотр",
      items: {
        create: top.map((r) => ({
          trackId: r.trackId,
          rank: r.rank,
          clipMode: "active_snippet",
          snippetLenSec: 30,
        })),
      },
    },
  });
  return config.id;
}

export async function getRenderConfig(userId: string, tournamentId: string) {
  return prisma.renderConfig.findFirst({
    where: { tournamentId, tournament: { userId } },
    include: {
      items: {
        orderBy: { rank: "asc" },
        include: { track: true, art: true },
      },
    },
  });
}

type LoadedConfig = NonNullable<Awaited<ReturnType<typeof getRenderConfig>>>;
type LoadedItem = LoadedConfig["items"][number];

function toAssembleItem(
  it: LoadedItem,
  defaultClipSec: number,
  audioRef: string,
  artRef: string | null,
): AssembleItem {
  return {
    trackId: it.trackId,
    rank: it.rank,
    title: it.track.title,
    artist: it.track.artist,
    customLabel: it.customLabel,
    clipMode: it.clipMode as ClipMode,
    clipStartSec: it.clipStartSec,
    clipEndSec: it.clipEndSec,
    snippetLenSec: it.snippetLenSec,
    durationSec: it.track.durationSec,
    resolvedStartSec: it.resolvedStartSec,
    artRef,
    artCrop: cropFromColumns(it.artCropX, it.artCropY, it.artCropW, it.artCropH),
    audioRef,
  };
}

/**
 * Ensure each track has a known duration, and that active-snippet items have a
 * cached RMS-resolved start. Runs the (cheap-ish) ffmpeg analysis only for rows
 * that still need it, so it's safe to call on every config load.
 */
export async function resolveActiveSnippets(userId: string, tournamentId: string) {
  const config = await getRenderConfig(userId, tournamentId);
  if (!config) return;

  for (const it of config.items) {
    const trackAbs = absPath(it.track.filePath);

    let duration = it.track.durationSec;
    if (duration == null) {
      duration = await probeDurationSec(trackAbs);
      if (duration != null) {
        await prisma.track.update({
          where: { id: it.trackId },
          data: { durationSec: duration },
        });
      }
    }

    if (it.clipMode === "active_snippet" && it.resolvedStartSec == null) {
      const clipSec = it.snippetLenSec ?? config.defaultClipSec;
      try {
        const snip = await findActiveSnippet(trackAbs, clipSec);
        await prisma.renderItem.update({
          where: { id: it.id },
          data: { resolvedStartSec: snip.startSec },
        });
      } catch {
        // leave null; render will fall back to start of track
      }
    }
  }
}

/** Build a preview plan (url asset mode) for the in-browser Remotion Player. */
export function buildPreviewPlan(config: LoadedConfig) {
  const items: AssembleItem[] = config.items.map((it) =>
    toAssembleItem(
      it,
      config.defaultClipSec,
      `/api/tracks/${it.trackId}/audio`,
      it.artId ? `/api/arts/${it.artId}` : null,
    ),
  );

  const planItems = assemblePlanItems(items, { defaultClipSec: config.defaultClipSec });
  return buildVideoPlan(
    {
      order: config.order as DisplayOrder,
      introEnabled: config.introEnabled,
      introText: config.introText,
      outroEnabled: config.outroEnabled,
      outroText: config.outroText,
    },
    planItems,
  );
}

export async function startRenderJob(userId: string, tournamentId: string) {
  const config = await getRenderConfig(userId, tournamentId);
  if (!config) throw new Error("NO_CONFIG");

  const job = await prisma.renderJob.create({
    data: { tournamentId, status: "queued", progress: 0 },
  });
  // Fire-and-forget: render in the background, report progress via the job row.
  void runRender(job.id).catch(async (err) => {
    await prisma.renderJob.update({
      where: { id: job.id },
      data: { status: "failed", error: String(err?.message ?? err) },
    });
  });
  return job.id;
}

async function setProgress(jobId: string, progress: number) {
  await prisma.renderJob.update({ where: { id: jobId }, data: { progress } });
}

async function runRender(jobId: string): Promise<void> {
  const job = await prisma.renderJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  await prisma.renderJob.update({
    where: { id: jobId },
    data: { status: "running", progress: 0.02 },
  });

  const config = await prisma.renderConfig.findFirst({
    where: { tournamentId: job.tournamentId },
    include: { items: { orderBy: { rank: "asc" }, include: { track: true, art: true } } },
  });
  if (!config) throw new Error("NO_CONFIG");

  // 1) Prepare assets in a per-job public dir for Remotion's staticFile().
  const publicDir = absPath(path.join("renders", "tmp", jobId, "public"));
  await mkdir(publicDir, { recursive: true });

  const assembleItems: AssembleItem[] = [];
  const n = config.items.length || 1;
  for (let i = 0; i < config.items.length; i++) {
    const it = config.items[i];
    const trackAbs = absPath(it.track.filePath);
    const mode = it.clipMode as ClipMode;

    // Determine duration (needed for "full"), preferring the stored value.
    let duration = it.track.durationSec;
    if (mode === "full" && duration == null) duration = await probeDurationSec(trackAbs);

    const clipSec = resolveClipSec(toAssembleItem(it, config.defaultClipSec, "", null), {
      defaultClipSec: config.defaultClipSec,
    });

    let start = 0;
    if (mode === "manual") start = it.clipStartSec ?? 0;
    else if (mode === "active_snippet") {
      start = it.resolvedStartSec ?? (await findActiveSnippet(trackAbs, clipSec)).startSec;
    }

    const audioBase = `${it.trackId}.aac`;
    await clipAudio(trackAbs, start, clipSec, path.join(publicDir, audioBase));

    let artBase: string | null = null;
    if (it.art) {
      const ext = path.extname(it.art.filePath) || ".jpg";
      artBase = `${it.artId}${ext}`;
      await copyFile(absPath(it.art.filePath), path.join(publicDir, artBase));
    }

    // Audio is pre-clipped, so the composition plays it from 0 for clipSec.
    assembleItems.push({
      trackId: it.trackId,
      rank: it.rank,
      title: it.track.title,
      artist: it.track.artist,
      customLabel: it.customLabel,
      clipMode: "manual",
      clipStartSec: 0,
      clipEndSec: clipSec,
      snippetLenSec: null,
      durationSec: clipSec,
      artRef: artBase,
      artCrop: cropFromColumns(it.artCropX, it.artCropY, it.artCropW, it.artCropH),
      audioRef: audioBase,
    });

    await setProgress(jobId, 0.05 + (0.45 * (i + 1)) / n);
  }

  const planItems = assemblePlanItems(assembleItems, {
    defaultClipSec: config.defaultClipSec,
  });
  const plan = buildVideoPlan(
    {
      order: config.order as DisplayOrder,
      introEnabled: config.introEnabled,
      introText: config.introText,
      outroEnabled: config.outroEnabled,
      outroText: config.outroText,
    },
    planItems,
  );

  // 2) Bundle the Remotion project and render.
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

  const inputProps = { plan, assetMode: "static" as const };
  // Launch options: optional system Chrome + "chrome-for-testing" mode so a modern
  // Chrome (which dropped old headless) works without downloading a headless shell.
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
  const chromeMode = "chrome-for-testing" as const;
  const composition = await selectComposition({
    serveUrl,
    id: "Top",
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
      void setProgress(jobId, 0.5 + 0.5 * progress);
    },
  });

  await prisma.renderJob.update({
    where: { id: jobId },
    data: { status: "done", progress: 1, outputPath: outputRel },
  });
}

export { STORAGE_ROOT };

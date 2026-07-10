import "server-only";
import path from "node:path";
import { prisma } from "@/lib/db";
import { saveFile, trackPath, removePath } from "@/lib/storage";
import { createEngine } from "@/lib/domain/engines";
import type { Comparison, ComparisonResult, Scheme } from "@/lib/domain/types";
import { isComparisonResult } from "@/lib/domain/types";
import type { ExtractedTrack } from "@/lib/upload";

export interface CreateInput {
  title: string;
  scheme: Scheme;
  blindMode: boolean;
}

export async function createTournament(
  userId: string,
  input: CreateInput,
  tracks: ExtractedTrack[],
) {
  if (tracks.length < 2) throw new Error("NEED_AT_LEAST_TWO_TRACKS");

  const tournament = await prisma.tournament.create({
    data: {
      userId,
      title: input.title,
      scheme: input.scheme,
      blindMode: input.blindMode,
      status: "in_progress",
    },
  });

  let order = 0;
  for (const t of tracks) {
    const created = await prisma.track.create({
      data: {
        tournamentId: tournament.id,
        title: t.title,
        artist: t.artist,
        durationSec: t.durationSec,
        filePath: "",
        order: order++,
      },
    });
    const ext = path.extname(t.filename) || ".mp3";
    const rel = await saveFile(trackPath(tournament.id, created.id, ext), t.data);
    await prisma.track.update({ where: { id: created.id }, data: { filePath: rel } });
  }

  return tournament;
}

export async function listTournaments(userId: string) {
  return prisma.tournament.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { tracks: true, comparisons: true } } },
  });
}

/** Load a tournament the user owns, with its tracks (ordered) and comparison log. */
export async function getTournament(userId: string, id: string) {
  const tournament = await prisma.tournament.findFirst({
    where: { id, userId },
    include: {
      tracks: { orderBy: { order: "asc" } },
      comparisons: { orderBy: { createdAt: "asc" } },
      rankings: { orderBy: { rank: "asc" } },
    },
  });
  return tournament;
}

export function toDomainComparisons(
  rows: { trackAId: string; trackBId: string; result: string }[],
): Comparison[] {
  return rows
    .filter((r) => isComparisonResult(r.result))
    .map((r) => ({
      a: r.trackAId,
      b: r.trackBId,
      result: r.result as ComparisonResult,
    }));
}

type LoadedTournament = NonNullable<Awaited<ReturnType<typeof getTournament>>>;

export function nextComparison(t: LoadedTournament) {
  const items = t.tracks.map((tr) => tr.id);
  const log = toDomainComparisons(t.comparisons);
  const engine = createEngine(t.scheme as Scheme);
  const pair = engine.nextPair(items, log);
  const progress = engine.progress(items, log);

  // Provisional standings (null for schemes without a meaningful interim ranking).
  const partial = engine.partialRanking(items, log);
  const byId = new Map(t.tracks.map((tr) => [tr.id, tr]));
  const standings = partial
    ? partial.map((r) => {
        const tr = byId.get(r.id)!;
        return { trackId: r.id, rank: r.rank, title: tr.title, artist: tr.artist, score: r.score };
      })
    : null;

  return { pair, progress, isComplete: pair === null, standings };
}

export async function recordComparison(
  t: LoadedTournament,
  aId: string,
  bId: string,
  result: ComparisonResult,
) {
  const ids = new Set(t.tracks.map((tr) => tr.id));
  if (!ids.has(aId) || !ids.has(bId) || aId === bId) {
    throw new Error("INVALID_PAIR");
  }
  await prisma.comparison.create({
    data: { tournamentId: t.id, trackAId: aId, trackBId: bId, result },
  });
  await prisma.tournament.update({
    where: { id: t.id },
    data: { updatedAt: new Date() },
  });
}

/**
 * Finalize a completed tournament. The first call computes the ranking from the
 * comparison log and persists it. Subsequent calls only adjust top-N and DO NOT
 * recompute the ranking — this preserves any manual reordering the user made.
 */
export async function finalize(t: LoadedTournament, topSize: number) {
  const items = t.tracks.map((tr) => tr.id);
  const log = toDomainComparisons(t.comparisons);
  const engine = createEngine(t.scheme as Scheme);
  if (!engine.isComplete(items, log)) throw new Error("NOT_COMPLETE");

  const clampedTop = Math.max(1, Math.min(topSize, items.length));

  if (t.status !== "completed" || t.rankings.length === 0) {
    const ranking = engine.ranking(items, log);
    await prisma.$transaction([
      prisma.ranking.deleteMany({ where: { tournamentId: t.id } }),
      ...ranking.map((r) =>
        prisma.ranking.create({
          data: { tournamentId: t.id, trackId: r.id, rank: r.rank, score: r.score },
        }),
      ),
      prisma.tournament.update({
        where: { id: t.id },
        data: { status: "completed", topSize: clampedTop },
      }),
    ]);
  } else {
    await prisma.tournament.update({
      where: { id: t.id },
      data: { topSize: clampedTop },
    });
  }

  await syncRenderConfigToRanking(t.id);
  return { topSize: clampedTop };
}

/** Manually reorder the final ranking (best -> worst by the given track order). */
export async function reorderRanking(
  userId: string,
  tournamentId: string,
  orderedTrackIds: string[],
) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, userId },
    include: { rankings: true },
  });
  if (!t) throw new Error("NOT_FOUND");
  if (t.status !== "completed") throw new Error("NOT_COMPLETE");

  const known = new Set(t.rankings.map((r) => r.trackId));
  if (orderedTrackIds.length !== known.size || orderedTrackIds.some((id) => !known.has(id))) {
    throw new Error("INVALID_ORDER");
  }

  await prisma.$transaction(
    orderedTrackIds.map((trackId, i) =>
      prisma.ranking.update({
        where: { tournamentId_trackId: { tournamentId, trackId } },
        data: { rank: i + 1 },
      }),
    ),
  );
  await syncRenderConfigToRanking(tournamentId);
}

/**
 * Keep the render config's items aligned with the current top-N ranking: update
 * ranks, add newly-included tracks, drop excluded ones, preserving per-item
 * settings (clip/art) for tracks that remain.
 */
async function syncRenderConfigToRanking(tournamentId: string) {
  const config = await prisma.renderConfig.findUnique({
    where: { tournamentId },
    include: { items: true },
  });
  if (!config) return;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { rankings: { orderBy: { rank: "asc" } } },
  });
  if (!tournament) return;

  const topSize = tournament.topSize ?? tournament.rankings.length;
  const desired = tournament.rankings.filter((r) => r.rank <= topSize);
  const desiredIds = new Set(desired.map((r) => r.trackId));
  const existing = new Map(config.items.map((it) => [it.trackId, it]));

  const ops = [];
  for (const r of desired) {
    const item = existing.get(r.trackId);
    if (item) {
      if (item.rank !== r.rank) {
        ops.push(prisma.renderItem.update({ where: { id: item.id }, data: { rank: r.rank } }));
      }
    } else {
      ops.push(
        prisma.renderItem.create({
          data: {
            renderConfigId: config.id,
            trackId: r.trackId,
            rank: r.rank,
            clipMode: "active_snippet",
            snippetLenSec: 30,
          },
        }),
      );
    }
  }
  for (const it of config.items) {
    if (!desiredIds.has(it.trackId)) {
      ops.push(prisma.renderItem.delete({ where: { id: it.id } }));
    }
  }
  if (ops.length) await prisma.$transaction(ops);
}

/** Delete a tournament the user owns, including its stored media and renders. */
export async function deleteTournament(userId: string, tournamentId: string) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, userId },
    include: { renderJobs: true },
  });
  if (!t) throw new Error("NOT_FOUND");

  // Remove stored media (best-effort) before the DB cascade.
  await removePath(path.join("tournaments", tournamentId));
  for (const job of t.renderJobs) {
    await removePath(path.join("renders", `${job.id}.mp4`));
    await removePath(path.join("renders", "tmp", job.id));
  }

  await prisma.tournament.delete({ where: { id: tournamentId } });
}

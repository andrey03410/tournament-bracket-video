import "server-only";
import path from "node:path";
import { stat } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { absPath, removePath } from "@/lib/storage";
import { isAssignableRole, quotasFor } from "@/lib/domain/permissions";

// Personal-cabinet usage overview + admin user management. Framework-free
// (thin routes on top), covered by integration tests against the real schema.

async function fileSize(relative: string): Promise<number> {
  try {
    return (await stat(absPath(relative))).size;
  } catch {
    return 0; // file missing on disk -> counts as zero, not an error
  }
}

/**
 * Backfill sizeBytes for rows created before phase 5 (best-effort, persisted
 * so the stat() cost is paid once per row).
 */
async function backfillSizes(userId: string): Promise<void> {
  const tracks = await prisma.track.findMany({
    where: { tournament: { userId }, sizeBytes: null, filePath: { not: "" } },
    select: { id: true, filePath: true },
  });
  for (const t of tracks) {
    await prisma.track.update({
      where: { id: t.id },
      data: { sizeBytes: await fileSize(t.filePath) },
    });
  }
  const arts = await prisma.art.findMany({
    where: { userId, sizeBytes: null, filePath: { not: "" } },
    select: { id: true, filePath: true },
  });
  for (const a of arts) {
    await prisma.art.update({
      where: { id: a.id },
      data: { sizeBytes: await fileSize(a.filePath) },
    });
  }
}

export interface UsageSummary {
  role: string;
  quotas: ReturnType<typeof quotasFor>;
  tournaments: {
    id: string;
    title: string;
    status: string;
    trackCount: number;
    sizeBytes: number;
    createdAt: Date;
  }[];
  arts: {
    id: string;
    label: string | null;
    kind: string;
    sizeBytes: number;
    usageCount: number;
    createdAt: Date;
  }[];
  renders: {
    id: string;
    tournamentId: string;
    tournamentTitle: string;
    status: string;
    sizeBytes: number;
    hasOutput: boolean;
    createdAt: Date;
  }[];
  archiveBytes: number;
  poolBytes: number;
  renderBytes: number;
}

/** Everything the personal cabinet shows: per-entity sizes + totals + quotas. */
export async function usageSummary(userId: string): Promise<UsageSummary> {
  await backfillSizes(userId);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { role: true },
  });
  const tournaments = await prisma.tournament.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { tracks: { select: { sizeBytes: true } } },
  });
  const arts = await prisma.art.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { renderItems: true } } },
  });
  const jobs = await prisma.renderJob.findMany({
    where: { OR: [{ tournament: { userId } }, { project: { userId } }] },
    orderBy: { createdAt: "desc" },
    include: {
      tournament: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
    },
  });

  const tournamentRows = tournaments.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    trackCount: t.tracks.length,
    sizeBytes: t.tracks.reduce((s, tr) => s + (tr.sizeBytes ?? 0), 0),
    createdAt: t.createdAt,
  }));
  const artRows = arts.map((a) => ({
    id: a.id,
    label: a.label,
    kind: a.kind,
    sizeBytes: a.sizeBytes ?? 0,
    usageCount: a._count.renderItems,
    createdAt: a.createdAt,
  }));
  const renderRows = [];
  for (const j of jobs) {
    renderRows.push({
      id: j.id,
      tournamentId: j.tournament?.id ?? j.project?.id ?? "",
      tournamentTitle: j.tournament?.title ?? j.project?.title ?? "—",
      status: j.status,
      sizeBytes: j.outputPath ? await fileSize(j.outputPath) : 0,
      hasOutput: Boolean(j.outputPath),
      createdAt: j.createdAt,
    });
  }

  return {
    role: user.role,
    quotas: quotasFor(user.role),
    tournaments: tournamentRows,
    arts: artRows,
    renders: renderRows,
    archiveBytes: tournamentRows.reduce((s, t) => s + t.sizeBytes, 0),
    poolBytes: artRows.reduce((s, a) => s + a.sizeBytes, 0),
    renderBytes: renderRows.reduce((s, r) => s + r.sizeBytes, 0),
  };
}

/** Delete a finished render job the user owns, including its MP4. */
export async function deleteRenderJob(userId: string, jobId: string) {
  const job = await prisma.renderJob.findFirst({
    where: { id: jobId, OR: [{ tournament: { userId } }, { project: { userId } }] },
  });
  if (!job) throw new Error("NOT_FOUND");
  if (job.status === "running" || job.status === "queued") throw new Error("JOB_ACTIVE");
  if (job.outputPath) await removePath(job.outputPath);
  await removePath(path.join("renders", "tmp", job.id));
  await prisma.renderJob.delete({ where: { id: job.id } });
}

// ---- Admin: user management ----

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  tournamentCount: number;
  diskBytes: number;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, createdAt: true },
  });
  const rows: AdminUserRow[] = [];
  for (const u of users) {
    await backfillSizes(u.id);
    const [trackAgg, artAgg, tournamentCount] = await Promise.all([
      prisma.track.aggregate({
        where: { tournament: { userId: u.id } },
        _sum: { sizeBytes: true },
      }),
      prisma.art.aggregate({ where: { userId: u.id }, _sum: { sizeBytes: true } }),
      prisma.tournament.count({ where: { userId: u.id } }),
    ]);
    rows.push({
      ...u,
      tournamentCount,
      diskBytes: (trackAgg._sum.sizeBytes ?? 0) + (artAgg._sum.sizeBytes ?? 0),
    });
  }
  return rows;
}

/** Change a user's role. Actors cannot change their own role (last-admin guard). */
export async function setUserRole(actorId: string, targetId: string, role: string) {
  if (!isAssignableRole(role)) throw new Error("BAD_ROLE");
  if (actorId === targetId) throw new Error("SELF_CHANGE");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new Error("NOT_FOUND");
  return prisma.user.update({ where: { id: targetId }, data: { role } });
}

/**
 * Delete a user with everything they own on disk: tournament media, render
 * outputs/temp, the media pool directory. DB rows go via cascade.
 */
export async function deleteUser(actorId: string, targetId: string) {
  if (actorId === targetId) throw new Error("SELF_CHANGE");
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      tournaments: { include: { renderJobs: true } },
      projects: { include: { renderJobs: true } },
    },
  });
  if (!target) throw new Error("NOT_FOUND");

  const jobs = [
    ...target.tournaments.flatMap((t) => t.renderJobs),
    ...target.projects.flatMap((p) => p.renderJobs),
  ];
  for (const t of target.tournaments) {
    await removePath(path.join("tournaments", t.id));
  }
  for (const job of jobs) {
    if (job.outputPath) await removePath(job.outputPath);
    await removePath(path.join("renders", "tmp", job.id));
  }
  await removePath(path.join("arts", targetId));
  await prisma.user.delete({ where: { id: targetId } });
}

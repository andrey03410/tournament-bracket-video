import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { absPath, removePath, saveFile } from "@/lib/storage";
import { createTournament, deleteTournament } from "@/server/tournaments";
import { createArt, poolUsageBytes } from "@/server/arts";
import { ensureAdminRole } from "@/server/roles";
import {
  usageSummary,
  listArchiveRows,
  deleteRenderJob,
  listUsers,
  setUserRole,
  deleteUser,
} from "@/server/users";
import type { ExtractedTrack } from "@/lib/upload";

// Phase-5 integration tests: quotas, role bootstrap, cabinet usage, admin
// user management — on the real Prisma schema (SQLite) and the real storage.

const EMAIL_USER = "integration-roles-user@test.local";
const EMAIL_ADMIN = "integration-roles-admin@test.local";
const EMAIL_VICTIM = "integration-roles-victim@test.local";
const ALL_EMAILS = [EMAIL_USER, EMAIL_ADMIN, EMAIL_VICTIM];

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function makeTracks(n = 2, bytes = 64): ExtractedTrack[] {
  return Array.from({ length: n }, (_, i) => ({
    filename: `t${i}.mp3`,
    title: `T${i}`,
    artist: null,
    durationSec: 1,
    kind: "audio" as const,
    data: Buffer.alloc(bytes, i + 1),
  }));
}

let userId: string;
let adminId: string;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: ALL_EMAILS } } });
  for (const u of users) {
    const tournaments = await prisma.tournament.findMany({ where: { userId: u.id } });
    for (const t of tournaments) await removePath(path.join("tournaments", t.id));
    await removePath(path.join("arts", u.id));
  }
  await prisma.user.deleteMany({ where: { email: { in: ALL_EMAILS } } });
}

beforeAll(async () => {
  await cleanup();
  userId = (
    await prisma.user.create({ data: { email: EMAIL_USER, passwordHash: "x" } })
  ).id;
  adminId = (
    await prisma.user.create({
      data: { email: EMAIL_ADMIN, passwordHash: "x", role: "admin" },
    })
  ).id;
});

afterAll(async () => {
  await cleanup();
});

describe("tournament slot quota", () => {
  afterEach(async () => {
    const ts = await prisma.tournament.findMany({ where: { userId } });
    for (const t of ts) await deleteTournament(userId, t.id);
  });

  it("registration default role is user", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.role).toBe("user");
  });

  it("allows the first tournament, rejects the second, frees the slot on delete", async () => {
    const first = await createTournament(
      userId,
      { title: "A", scheme: "merge", blindMode: false },
      makeTracks(),
      { maxTournaments: 1 },
    );
    await expect(
      createTournament(
        userId,
        { title: "B", scheme: "merge", blindMode: false },
        makeTracks(),
        { maxTournaments: 1 },
      ),
    ).rejects.toThrow("TOURNAMENT_LIMIT");

    await deleteTournament(userId, first.id);
    const second = await createTournament(
      userId,
      { title: "B", scheme: "merge", blindMode: false },
      makeTracks(),
      { maxTournaments: 1 },
    );
    expect(second.id).toBeTruthy();
  });

  it("two concurrent creates cannot both squeeze past the quota", async () => {
    const attempt = () =>
      createTournament(
        userId,
        { title: "race", scheme: "merge", blindMode: false },
        makeTracks(),
        { maxTournaments: 1 },
      ).then(
        () => "ok" as const,
        (e) => (e as Error).message,
      );
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "TOURNAMENT_LIMIT")).toHaveLength(1);
    expect(await prisma.tournament.count({ where: { userId } })).toBe(1);
  });

  it("null limit means unlimited (admin)", async () => {
    const a = await createTournament(
      adminId,
      { title: "A1", scheme: "merge", blindMode: false },
      makeTracks(),
      { maxTournaments: null },
    );
    const b = await createTournament(
      adminId,
      { title: "A2", scheme: "merge", blindMode: false },
      makeTracks(),
    );
    expect(a.id).not.toBe(b.id);
    await deleteTournament(adminId, a.id);
    await deleteTournament(adminId, b.id);
  });

  it("fills Track.sizeBytes on upload", async () => {
    const t = await createTournament(
      userId,
      { title: "S", scheme: "merge", blindMode: false },
      makeTracks(2, 128),
      { maxTournaments: 1 },
    );
    const tracks = await prisma.track.findMany({ where: { tournamentId: t.id } });
    expect(tracks.map((tr) => tr.sizeBytes)).toEqual([128, 128]);
  });
});

describe("pool quota", () => {
  afterEach(async () => {
    await prisma.art.deleteMany({ where: { userId } });
    await removePath(path.join("arts", userId));
  });

  it("fills Art.sizeBytes and tracks pool usage", async () => {
    await createArt(userId, { fileName: "a.png", data: PNG, maxPoolBytes: null });
    expect(await poolUsageBytes(userId)).toBe(PNG.length);
  });

  it("rejects an upload that would exceed the quota, boundary inclusive", async () => {
    await createArt(userId, { fileName: "a.png", data: PNG, maxPoolBytes: PNG.length });
    await expect(
      createArt(userId, { fileName: "b.png", data: PNG, maxPoolBytes: PNG.length }),
    ).rejects.toThrow("POOL_QUOTA");
    // nothing half-created: one row, one file's worth of usage
    expect(await prisma.art.count({ where: { userId } })).toBe(1);
  });
});

describe("admin bootstrap via ADMIN_EMAILS", () => {
  const prev = process.env.ADMIN_EMAILS;
  afterEach(() => {
    process.env.ADMIN_EMAILS = prev;
  });

  it("elevates a listed email (case-insensitive) and persists", async () => {
    process.env.ADMIN_EMAILS = ` Other@x.y , ${EMAIL_USER.toUpperCase()} `;
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await ensureAdminRole(u)).toBe("admin");
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(fresh.role).toBe("admin");
    // put the fixture back
    await prisma.user.update({ where: { id: userId }, data: { role: "user" } });
  });

  it("leaves unlisted emails untouched", async () => {
    process.env.ADMIN_EMAILS = "someone-else@test.local";
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await ensureAdminRole(u)).toBe("user");
  });
});

describe("cabinet usage summary", () => {
  it("reports sizes per entity, totals, and backfills legacy rows", async () => {
    const t = await createTournament(
      userId,
      { title: "Usage", scheme: "merge", blindMode: false },
      makeTracks(2, 100),
      { maxTournaments: 1 },
    );
    // legacy row: file on disk but sizeBytes null -> must be backfilled by stat
    const legacyRel = await saveFile(
      path.join("tournaments", t.id, "tracks", "legacy.mp3"),
      Buffer.alloc(50),
    );
    const legacy = await prisma.track.create({
      data: {
        tournamentId: t.id,
        title: "Legacy",
        filePath: legacyRel,
        order: 99,
        sizeBytes: null,
      },
    });
    await createArt(userId, { fileName: "a.png", data: PNG, maxPoolBytes: null });

    const s = await usageSummary(userId);
    expect(s.role).toBe("user");
    expect(s.quotas.maxTournaments).toBe(1);
    // phase 17: the summary carries aggregates, the rows come from listArchiveRows
    expect(s.archives).toEqual({ count: 1, bytes: 250 }); // 100 + 100 + backfilled 50
    expect(s.archiveBytes).toBe(250);
    expect(s.poolBytes).toBe(PNG.length);
    expect(s.pool.byKind.image).toEqual({ count: 1, bytes: PNG.length });

    const archives = await listArchiveRows(userId);
    expect(archives).toHaveLength(1);
    expect(archives[0].trackCount).toBe(3);
    expect(archives[0].sizeBytes).toBe(250);

    const backfilled = await prisma.track.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(backfilled.sizeBytes).toBe(50);

    await deleteTournament(userId, t.id);
    await prisma.art.deleteMany({ where: { userId } });
    await removePath(path.join("arts", userId));
  });

  it("deleteRenderJob removes the output file and refuses active jobs", async () => {
    const t = await createTournament(
      userId,
      { title: "Jobs", scheme: "merge", blindMode: false },
      makeTracks(),
      { maxTournaments: 1 },
    );
    const outRel = await saveFile(path.join("renders", "it-job.mp4"), Buffer.alloc(10));
    const done = await prisma.renderJob.create({
      data: { tournamentId: t.id, status: "done", outputPath: outRel },
    });
    const running = await prisma.renderJob.create({
      data: { tournamentId: t.id, status: "running" },
    });

    await expect(deleteRenderJob(userId, running.id)).rejects.toThrow("JOB_ACTIVE");
    await expect(deleteRenderJob(adminId, done.id)).rejects.toThrow("NOT_FOUND"); // foreign

    expect(existsSync(absPath(outRel))).toBe(true);
    await deleteRenderJob(userId, done.id);
    expect(existsSync(absPath(outRel))).toBe(false);
    expect(await prisma.renderJob.findUnique({ where: { id: done.id } })).toBeNull();

    await prisma.renderJob.delete({ where: { id: running.id } });
    await deleteTournament(userId, t.id);
  });
});

describe("admin user management", () => {
  it("listUsers reports counts and disk usage", async () => {
    const t = await createTournament(
      userId,
      { title: "List", scheme: "merge", blindMode: false },
      makeTracks(2, 100),
      { maxTournaments: 1 },
    );
    const rows = await listUsers();
    const me = rows.find((r) => r.id === userId);
    expect(me).toBeTruthy();
    expect(me!.tournamentCount).toBe(1);
    expect(me!.diskBytes).toBe(200);
    expect(me!.role).toBe("user");
    await deleteTournament(userId, t.id);
  });

  it("setUserRole validates the role and forbids self-change", async () => {
    await expect(setUserRole(adminId, userId, "superuser")).rejects.toThrow("BAD_ROLE");
    await expect(setUserRole(adminId, adminId, "user")).rejects.toThrow("SELF_CHANGE");
    await expect(setUserRole(adminId, "missing-id", "user")).rejects.toThrow("NOT_FOUND");

    const updated = await setUserRole(adminId, userId, "admin");
    expect(updated.role).toBe("admin");
    await setUserRole(adminId, userId, "user"); // restore fixture
  });

  it("deleteUser wipes tournaments, pool and render outputs from disk", async () => {
    const victim = await prisma.user.create({
      data: { email: EMAIL_VICTIM, passwordHash: "x" },
    });
    const t = await createTournament(
      victim.id,
      { title: "Victim", scheme: "merge", blindMode: false },
      makeTracks(),
      { maxTournaments: 1 },
    );
    const art = await createArt(victim.id, {
      fileName: "v.png",
      data: PNG,
      maxPoolBytes: null,
    });
    const outRel = await saveFile(path.join("renders", "victim-job.mp4"), Buffer.alloc(9));
    const job = await prisma.renderJob.create({
      data: { tournamentId: t.id, status: "done", outputPath: outRel },
    });

    await expect(deleteUser(victim.id, victim.id)).rejects.toThrow("SELF_CHANGE");

    const trackFiles = await prisma.track.findMany({ where: { tournamentId: t.id } });
    expect(trackFiles.every((tr) => existsSync(absPath(tr.filePath)))).toBe(true);
    expect(existsSync(absPath(art.filePath))).toBe(true);

    await deleteUser(adminId, victim.id);

    expect(await prisma.user.findUnique({ where: { id: victim.id } })).toBeNull();
    expect(await prisma.tournament.findUnique({ where: { id: t.id } })).toBeNull();
    expect(await prisma.renderJob.findUnique({ where: { id: job.id } })).toBeNull();
    expect(existsSync(absPath(path.join("tournaments", t.id)))).toBe(false);
    expect(existsSync(absPath(path.join("arts", victim.id)))).toBe(false);
    expect(existsSync(absPath(outRel))).toBe(false);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createProject } from "@/server/projects";
import { listRenderJobs } from "@/server/render";

// Integration tests: listing render jobs for the constructor UIs — the list
// the client uses to restore an in-flight/finished render after a reload.

const EMAIL = "integration-render-jobs@test.local";
const EMAIL_OTHER = "integration-render-jobs-other@test.local";

let userId: string;
let otherUserId: string;
let projectId: string;
let tournamentId: string;

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EMAIL_OTHER] } } });
}

beforeAll(async () => {
  await cleanup();
  userId = (await prisma.user.create({ data: { email: EMAIL, passwordHash: "x" } })).id;
  otherUserId = (await prisma.user.create({ data: { email: EMAIL_OTHER, passwordHash: "x" } })).id;

  projectId = (await createProject(userId, "Тест рендер-джобов", "picker")).id;
  tournamentId = (
    await prisma.tournament.create({ data: { userId, title: "Турнир", scheme: "merge" } })
  ).id;
});

afterAll(async () => {
  await cleanup();
});

describe("listRenderJobs", () => {
  it("возвращает джобы проекта новее-первым с downloadUrl для готовых", async () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    const done = await prisma.renderJob.create({
      data: {
        projectId, status: "done", progress: 1,
        outputPath: "renders/x.mp4", createdAt: t0,
      },
    });
    const running = await prisma.renderJob.create({
      data: {
        projectId, status: "running", progress: 0.4,
        createdAt: new Date(t0.getTime() + 1000),
      },
    });

    const jobs = await listRenderJobs(userId, { projectId });
    expect(jobs.map((j) => j.id)).toEqual([running.id, done.id]);
    expect(jobs[0]).toMatchObject({ status: "running", progress: 0.4, downloadUrl: null });
    expect(jobs[1]).toMatchObject({
      status: "done",
      downloadUrl: `/api/render-jobs/${done.id}/download`,
    });
  });

  it("возвращает джобы турнира и не смешивает владельцев", async () => {
    const tJob = await prisma.renderJob.create({
      data: { tournamentId, status: "failed", error: "boom" },
    });

    const tournamentJobs = await listRenderJobs(userId, { tournamentId });
    expect(tournamentJobs.map((j) => j.id)).toEqual([tJob.id]);
    expect(tournamentJobs[0]).toMatchObject({ status: "failed", error: "boom" });

    const projectJobs = await listRenderJobs(userId, { projectId });
    expect(projectJobs.map((j) => j.id)).not.toContain(tJob.id);
  });

  it("чужому пользователю джобы не видны", async () => {
    expect(await listRenderJobs(otherUserId, { projectId })).toEqual([]);
    expect(await listRenderJobs(otherUserId, { tournamentId })).toEqual([]);
  });
});

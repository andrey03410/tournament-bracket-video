import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { pollDownload } from "@/mcp/youtube";

const EMAIL = "integration-mcp-youtube@test.local";
let userId: string;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: "x", role: "admin" } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.downloadJob.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

describe("pollDownload", () => {
  it("resolves with artId when the job completes", async () => {
    const job = await prisma.downloadJob.create({
      data: { userId, url: "https://x/y", mode: "audio", quality: 0, status: "running" },
    });
    setTimeout(() => {
      // .catch keeps a live handler on the promise: an unhandled, unreferenced
      // fire-and-forget update here was observed to sometimes never land
      // (Prisma's library query engine appears to drop it) under Vitest,
      // stalling this test until pollDownload's own timeout. Harmless no-op
      // handler avoids that without changing the test's intent.
      void prisma.downloadJob
        .update({ where: { id: job.id }, data: { status: "done", artId: "art-xyz" } })
        .catch(() => {});
    }, 150);
    const res = await pollDownload(job.id, { timeoutMs: 5000, intervalMs: 50 });
    expect(res.artId).toBe("art-xyz");
  });

  it("throws with the job error when the job fails", async () => {
    const job = await prisma.downloadJob.create({
      data: { userId, url: "https://x/y", mode: "audio", quality: 0, status: "failed", error: "boom" },
    });
    await expect(pollDownload(job.id, { timeoutMs: 1000, intervalMs: 50 })).rejects.toThrow("boom");
  });

  it("throws on timeout while still running", async () => {
    const job = await prisma.downloadJob.create({
      data: { userId, url: "https://x/y", mode: "audio", quality: 0, status: "running" },
    });
    await expect(pollDownload(job.id, { timeoutMs: 120, intervalMs: 40 })).rejects.toThrow(/Тайм-аут/);
  });
});

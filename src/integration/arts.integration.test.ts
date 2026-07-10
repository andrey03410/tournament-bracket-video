import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { prisma } from "@/lib/db";
import { absPath, removePath } from "@/lib/storage";
import {
  listArts,
  listRecentArts,
  createArt,
  renameArt,
  deleteArt,
} from "@/server/arts";
import { patchRenderItem } from "@/server/render-items";

// Integration tests for the arts service layer + render-item patching, on the
// real Prisma schema (SQLite). Covers every scenario from the phase-3 spec.

const EMAIL = "integration-arts@test.local";
const EMAIL_OTHER = "integration-arts-other@test.local";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let userId: string;
let otherUserId: string;
let itemId: string;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL, EMAIL_OTHER] } },
  });
  for (const u of users) await removePath(`arts/${u.id}`);
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EMAIL_OTHER] } } });
}

beforeAll(async () => {
  await cleanup();
  const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: "x" } });
  userId = user.id;
  const other = await prisma.user.create({
    data: { email: EMAIL_OTHER, passwordHash: "x" },
  });
  otherUserId = other.id;

  // Minimal tournament -> render config -> one item, to exercise assignment/crop.
  const tournament = await prisma.tournament.create({
    data: { userId, title: "Arts IT", scheme: "merge", status: "completed", topSize: 1 },
  });
  const track = await prisma.track.create({
    data: { tournamentId: tournament.id, title: "T", filePath: "fake/t.mp3", order: 0 },
  });
  const config = await prisma.renderConfig.create({
    data: {
      tournamentId: tournament.id,
      items: { create: [{ trackId: track.id, rank: 1 }] },
    },
    include: { items: true },
  });
  itemId = config.items[0].id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("arts service", () => {
  it("uploads with a default label from the file name and stores the file", async () => {
    const art = await createArt(userId, { fileName: "Roaring Tides.png", data: PNG });
    expect(art.label).toBe("Roaring Tides");
    expect(existsSync(absPath(art.filePath))).toBe(true);
  });

  it("rejects unsupported extensions", async () => {
    await expect(
      createArt(userId, { fileName: "notes.txt", data: PNG }),
    ).rejects.toThrow("BAD_EXT");
  });

  it("searches by label and paginates without gaps or overlap", async () => {
    const labels = ["Alpha", "Alpha Two", "Beta", "Gamma", "Delta"];
    for (const label of labels) {
      await createArt(userId, { fileName: `${label}.png`, data: PNG, label });
    }

    const found = await listArts(userId, { q: "alpha" });
    expect(found.arts.map((a) => a.label).sort()).toEqual(["Alpha", "Alpha Two"]);

    // walk all pages with limit 2
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = await listArts(userId, { limit: 2, cursor: cursor ?? undefined });
      expect(page.arts.length).toBeLessThanOrEqual(2);
      seen.push(...page.arts.map((a) => a.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    const all = await listArts(userId, { limit: 100 });
    expect(new Set(seen).size).toBe(seen.length); // no overlap
    expect(seen.length).toBe(all.arts.length); // no gaps
  });

  it("does not leak other users' arts", async () => {
    await createArt(otherUserId, { fileName: "foreign.png", data: PNG });
    const mine = await listArts(userId, { q: "foreign" });
    expect(mine.arts).toHaveLength(0);
  });

  it("renames own art and refuses a foreign one", async () => {
    const art = await createArt(userId, { fileName: "rename-me.png", data: PNG });
    await renameArt(userId, art.id, "Renamed");
    const reloaded = await prisma.art.findUnique({ where: { id: art.id } });
    expect(reloaded?.label).toBe("Renamed");

    await expect(renameArt(otherUserId, art.id, "Hijack")).rejects.toThrow("NOT_FOUND");
  });

  it("tracks recent arts only after they are used", async () => {
    const art = await createArt(userId, { fileName: "recent.png", data: PNG });
    expect((await listRecentArts(userId)).map((a) => a.id)).not.toContain(art.id);

    await patchRenderItem(userId, itemId, { artId: art.id });
    const recent = await listRecentArts(userId);
    expect(recent[0]?.id).toBe(art.id);

    const listed = await listArts(userId, { q: "recent" });
    expect(listed.arts[0]?.usageCount).toBe(1);
  });

  it("deletes an art: file and row gone, positions freed, crop cleared", async () => {
    const art = await createArt(userId, { fileName: "doomed.png", data: PNG });
    await patchRenderItem(userId, itemId, {
      artId: art.id,
      artCrop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });

    await deleteArt(userId, art.id);

    expect(await prisma.art.findUnique({ where: { id: art.id } })).toBeNull();
    expect(existsSync(absPath(art.filePath))).toBe(false);
    const item = await prisma.renderItem.findUnique({ where: { id: itemId } });
    expect(item?.artId).toBeNull();
    expect(item?.artCropX).toBeNull();
    expect(item?.artCropW).toBeNull();
  });

  it("refuses to delete a foreign art", async () => {
    const art = await createArt(otherUserId, { fileName: "keep.png", data: PNG });
    await expect(deleteArt(userId, art.id)).rejects.toThrow("NOT_FOUND");
  });
});

describe("render-item art assignment and crop", () => {
  it("sets and updates the crop on an item that has an art", async () => {
    const art = await createArt(userId, { fileName: "crop-target.png", data: PNG });
    await patchRenderItem(userId, itemId, {
      artId: art.id,
      artCrop: { x: 0, y: 0, w: 1, h: 1 },
    });
    let item = await prisma.renderItem.findUnique({ where: { id: itemId } });
    expect(item?.artCropW).toBe(1);

    await patchRenderItem(userId, itemId, { artCrop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } });
    item = await prisma.renderItem.findUnique({ where: { id: itemId } });
    expect(item?.artCropX).toBe(0.25);
    expect(item?.artCropW).toBe(0.5);
  });

  it("resets the crop to auto-cover with an explicit null", async () => {
    await patchRenderItem(userId, itemId, { artCrop: null });
    const item = await prisma.renderItem.findUnique({ where: { id: itemId } });
    expect(item?.artCropX).toBeNull();
    expect(item?.artCropH).toBeNull();
  });

  it("resets the crop when the art changes without a new crop", async () => {
    await patchRenderItem(userId, itemId, { artCrop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
    const another = await createArt(userId, { fileName: "another.png", data: PNG });
    await patchRenderItem(userId, itemId, { artId: another.id });
    const item = await prisma.renderItem.findUnique({ where: { id: itemId } });
    expect(item?.artId).toBe(another.id);
    expect(item?.artCropX).toBeNull();
  });

  it("rejects an invalid crop rect", async () => {
    await expect(
      patchRenderItem(userId, itemId, { artCrop: { x: 0.8, y: 0, w: 0.5, h: 1 } }),
    ).rejects.toThrow("INVALID_CROP");
    await expect(
      patchRenderItem(userId, itemId, { artCrop: { x: 0 } }),
    ).rejects.toThrow("INVALID_CROP");
  });

  it("rejects a crop on an item without an art", async () => {
    await patchRenderItem(userId, itemId, { artId: null });
    await expect(
      patchRenderItem(userId, itemId, { artCrop: { x: 0, y: 0, w: 1, h: 1 } }),
    ).rejects.toThrow("NO_ART");
  });

  it("rejects a foreign art and a foreign item", async () => {
    const foreign = await createArt(otherUserId, { fileName: "foreign2.png", data: PNG });
    await expect(
      patchRenderItem(userId, itemId, { artId: foreign.id }),
    ).rejects.toThrow("ART_NOT_FOUND");
    await expect(
      patchRenderItem(otherUserId, itemId, { artId: foreign.id }),
    ).rejects.toThrow("NOT_FOUND");
  });
});

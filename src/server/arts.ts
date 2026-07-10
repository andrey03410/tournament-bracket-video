import "server-only";
import path from "node:path";
import { prisma } from "@/lib/db";
import { saveFile, removePath, artPath } from "@/lib/storage";

// Service layer for the user's art pool: listing/search/pagination, upload,
// rename, delete. Kept framework-free (thin routes on top) so the full behavior
// is covered by integration tests against the real schema.

export const IMG_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const RECENT_LIMIT = 8;

export interface ArtRow {
  id: string;
  label: string | null;
  filePath: string;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const ART_INCLUDE = { _count: { select: { renderItems: true } } } as const;

type ArtWithCount = Awaited<
  ReturnType<typeof prisma.art.findMany<{ include: typeof ART_INCLUDE }>>
>[number];

function toRow(a: ArtWithCount): ArtRow {
  return {
    id: a.id,
    label: a.label,
    filePath: a.filePath,
    usageCount: a._count.renderItems,
    lastUsedAt: a.lastUsedAt,
    createdAt: a.createdAt,
  };
}

export interface ListArtsOptions {
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Newest-first listing with optional label search and cursor pagination. */
export async function listArts(
  userId: string,
  opts: ListArtsOptions = {},
): Promise<{ arts: ArtRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const q = opts.q?.trim();

  const rows = await prisma.art.findMany({
    where: {
      userId,
      ...(q ? { label: { contains: q } } : {}),
    },
    include: ART_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // one extra row tells us whether a next page exists
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const page = rows.slice(0, limit);
  return {
    arts: page.map(toRow),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}

/** Arts recently assigned to render items, most recent first. */
export async function listRecentArts(
  userId: string,
  limit = RECENT_LIMIT,
): Promise<ArtRow[]> {
  const rows = await prisma.art.findMany({
    where: { userId, lastUsedAt: { not: null } },
    include: ART_INCLUDE,
    orderBy: { lastUsedAt: "desc" },
    take: limit,
  });
  return rows.map(toRow);
}

export interface CreateArtInput {
  fileName: string;
  data: Buffer;
  label?: string | null;
}

/** Store an uploaded image; the label defaults to the file name sans extension. */
export async function createArt(userId: string, input: CreateArtInput) {
  const ext = (path.extname(input.fileName) || ".jpg").toLowerCase();
  if (!IMG_EXT.includes(ext)) throw new Error("BAD_EXT");

  const label =
    input.label?.trim() ||
    path.basename(input.fileName, path.extname(input.fileName)).trim() ||
    null;

  const art = await prisma.art.create({ data: { userId, filePath: "", label } });
  const rel = await saveFile(artPath(userId, art.id, ext), input.data);
  return prisma.art.update({ where: { id: art.id }, data: { filePath: rel } });
}

async function ownedArt(userId: string, artId: string) {
  const art = await prisma.art.findFirst({ where: { id: artId, userId } });
  if (!art) throw new Error("NOT_FOUND");
  return art;
}

export async function renameArt(userId: string, artId: string, label: string | null) {
  const art = await ownedArt(userId, artId);
  return prisma.art.update({
    where: { id: art.id },
    data: { label: label?.trim() || null },
  });
}

/**
 * Delete an art: positions referencing it are freed (artId -> null via the FK)
 * and their per-position crops are cleared in the same transaction; the file is
 * removed from storage afterwards (best-effort).
 */
export async function deleteArt(userId: string, artId: string) {
  const art = await ownedArt(userId, artId);
  await prisma.$transaction([
    prisma.renderItem.updateMany({
      where: { artId: art.id },
      data: { artCropX: null, artCropY: null, artCropW: null, artCropH: null },
    }),
    prisma.art.delete({ where: { id: art.id } }),
  ]);
  await removePath(art.filePath);
}

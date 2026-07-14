import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { prisma } from "@/lib/db";
import { removePath } from "@/lib/storage";
import { search, importPoster } from "@/server/shikimori";

// Real DB + createArt pipeline; Shikimori is a LOCAL http server pointed at via
// SHIKIMORI_BASE_URL (no external network). A 1x1 jpg stands in for a poster.
const EMAIL = "integration-shikimori@test.local";
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////" +
    "////////////////////////////////////////////////////wgARCAABAAEDASIAAhEBAxEB" +
    "/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAB" +
    "//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oA" +
    "CAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAA" +
    "AAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgAD" +
    "AAAAEB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAA" +
    "AA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
  "base64",
);

let userId: string;
let server: Server;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: EMAIL } });
  for (const u of users) await removePath(`arts/${u.id}`);
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    if (url.pathname === "/api/animes") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([
        { id: 20, name: "Naruto", russian: "Наруто", kind: "tv", score: "8.02", aired_on: "2002-10-03",
          image: { original: "/system/animes/original/20.jpg", preview: "/system/animes/preview/20.jpg" } },
      ]));
      return;
    }
    if (url.pathname === "/api/characters/search") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([
        { id: 17, name: "Naruto Uzumaki", russian: "Наруто Узумаки",
          image: { original: "/system/characters/original/17.jpg", preview: "/system/characters/preview/17.jpg" } },
      ]));
      return;
    }
    if (url.pathname.startsWith("/system/")) {
      res.setHeader("content-type", "image/jpeg");
      res.end(JPG);
      return;
    }
    res.statusCode = 404;
    res.end("no");
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  process.env.SHIKIMORI_BASE_URL = `http://127.0.0.1:${port}`;

  await cleanup();
  const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: "x", role: "admin" } });
  userId = user.id;
});

afterAll(async () => {
  await cleanup();
  await new Promise<void>((r) => server.close(() => r()));
});

describe("shikimori search", () => {
  it("normalizes anime hits into DTOs with a thumb url and facts", async () => {
    const res = await search("anime", "naruto");
    expect(res).toHaveLength(1);
    expect(res[0].label).toBe("Наруто");
    expect(res[0].posterPath).toBe("/system/animes/original/20.jpg");
    expect(res[0].thumbUrl).toContain("/system/animes/preview/20.jpg");
    expect(res[0].facts).toContain("2002");
  });
  it("normalizes character hits", async () => {
    const res = await search("character", "naruto");
    expect(res[0].label).toBe("Наруто Узумаки");
  });
  it("returns [] for a blank query without hitting the network", async () => {
    expect(await search("anime", "   ")).toEqual([]);
  });
});

describe("shikimori importPoster", () => {
  it("downloads the poster into the pool as an image art", async () => {
    const { artId } = await importPoster(userId, {
      type: "anime", id: 20, posterPath: "/system/animes/original/20.jpg",
      label: "Наруто", maxPoolBytes: null,
    });
    const art = await prisma.art.findUniqueOrThrow({ where: { id: artId } });
    expect(art.kind).toBe("image");
    expect(art.label).toBe("Наруто");
    expect(art.sizeBytes).toBeGreaterThan(0);
  });

  it("rejects an unsafe image path", async () => {
    await expect(
      importPoster(userId, { type: "anime", id: 1, posterPath: "/etc/passwd", label: "x", maxPoolBytes: null }),
    ).rejects.toThrow("BAD_IMAGE_PATH");
  });

  it("enforces the pool quota", async () => {
    await expect(
      importPoster(userId, {
        type: "anime", id: 20, posterPath: "/system/animes/original/20.jpg",
        label: "Наруто", maxPoolBytes: 1,
      }),
    ).rejects.toThrow("POOL_QUOTA");
  });
});

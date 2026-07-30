import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { prisma } from "@/lib/db";
import { removePath } from "@/lib/storage";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

const EMAIL = "integration-mcp-e2e@test.local";
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

const ROOT = resolve(__dirname, "..", "..");
let userId: string;
let shiki: Server;
let client: Client;
let transport: StdioClientTransport;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: EMAIL } });
  for (const u of users) await removePath(`arts/${u.id}`);
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

// Parse the JSON payload a tool returns in its text content.
async function call(name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  const text = res.content.map((c) => c.text).join("");
  const data = JSON.parse(text);
  if (res.isError) throw new Error(`tool ${name} failed: ${text}`);
  return data;
}

beforeAll(async () => {
  shiki = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    if (url.pathname === "/api/studios") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([{ id: 11, name: "Madhouse", filtered_name: "Madhouse" }]));
      return;
    }
    if (url.pathname === "/api/animes" && url.searchParams.get("studio")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([
        { id: 1535, name: "Death Note", russian: "Тетрадь смерти", kind: "tv", score: "8.62", aired_on: "2006-10-04",
          image: { original: "/system/animes/original/1535.jpg", preview: "/system/animes/preview/1535.jpg" } },
      ]));
      return;
    }
    if (/^\/api\/animes\/\d+\/roles$/.test(url.pathname)) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([
        { roles: ["Main"], character: { id: 17, name: "Light", russian: "Лайт",
          image: { original: "/system/characters/original/17.jpg", preview: "/system/characters/preview/17.jpg" } } },
        { roles: ["Main"], character: { id: 18, name: "L", russian: "Эл",
          image: { original: "/system/characters/original/18.jpg", preview: "/system/characters/preview/18.jpg" } } },
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
  await new Promise<void>((r) => shiki.listen(0, r));
  const port = (shiki.address() as { port: number }).port;

  await cleanup();
  const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: "x", role: "admin" } });
  userId = user.id;

  transport = new StdioClientTransport({
    command: resolve(ROOT, "node_modules/.bin/tsx"),
    args: ["--tsconfig", "tsconfig.mcp.json", "src/mcp/server.ts"],
    cwd: ROOT,
    env: {
      ...getDefaultEnvironment(),
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      MCP_ACTOR_EMAIL: EMAIL,
      SHIKIMORI_BASE_URL: `http://127.0.0.1:${port}`,
    },
    stderr: "inherit",
  });
  client = new Client({ name: "e2e", version: "0" });
  await client.connect(transport);
}, 60_000);

afterAll(async () => {
  await transport?.close();
  await cleanup();
  await new Promise<void>((r) => shiki.close(() => r()));
});

describe("MCP server end-to-end (Madhouse scenario)", () => {
  it("exposes the expected tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of [
      "shikimori_find_studio", "shikimori_studio_animes", "shikimori_anime_characters",
      "shikimori_search", "import_shikimori_poster", "import_youtube_audio",
      "create_picker_project", "add_round", "add_tile", "add_tile_from_shikimori",
      "set_playlist", "get_project",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("builds a two-round picker with answers via tools", async () => {
    const { projectId, firstRoundId } = await call("create_picker_project", {
      title: "Персонажи Madhouse",
      orientation: "portrait",
      introText: "Угадай персонажа Madhouse",
      outroText: "", // empty = no final card
    });
    expect(projectId).toMatch(/.+/);

    const studios = await call("shikimori_find_studio", { query: "Madhouse" });
    expect(studios[0]).toMatchObject({ id: 11, name: "Madhouse" });

    const animes = await call("shikimori_studio_animes", { studioId: 11 });
    expect(animes[0]).toMatchObject({ id: 1535, type: "anime" });

    const chars = await call("shikimori_anime_characters", { animeId: 1535 });
    expect(chars.map((c: { id: number }) => c.id).sort()).toEqual([17, 18]);

    await call("add_tile_from_shikimori", {
      roundId: firstRoundId, type: "character", id: 17,
      posterPath: "/system/characters/original/17.jpg", label: "Лайт", isAnswer: true,
    });
    await call("add_tile_from_shikimori", {
      roundId: firstRoundId, type: "character", id: 18,
      posterPath: "/system/characters/original/18.jpg", label: "Эл", fitMode: "contain",
    });

    const { roundId } = await call("add_round", { projectId, prompt: "Второй раунд" });
    await call("add_tile_from_shikimori", {
      roundId, type: "character", id: 17,
      posterPath: "/system/characters/original/17.jpg", label: "Лайт", isAnswer: true,
    });

    const summary = await call("get_project", { projectId });
    expect(summary.intro).toBe("Угадай персонажа Madhouse");
    expect(summary.outro).toBeNull();
    expect(summary.rounds).toHaveLength(2);
    expect(summary.rounds[0].tiles).toHaveLength(2);
    expect(summary.rounds[0].tiles.filter((t: { isAnswer: boolean }) => t.isAnswer)).toHaveLength(1);

    // The project really exists in the DB for the actor.
    const rounds = await prisma.pickerRound.count({ where: { projectId, project: { userId } } });
    expect(rounds).toBe(2);

    const proj = await prisma.videoProject.findUniqueOrThrow({ where: { id: projectId } });
    expect(proj.tileOrientation).toBe("portrait");
    const answerTile = await prisma.pickerTile.findFirstOrThrow({
      where: { round: { projectId }, fitMode: "contain" },
    });
    expect(answerTile.fitMode).toBe("contain");

    // set_round edits an existing round's prompt in place.
    await call("set_round", { roundId: firstRoundId, prompt: "Обновлённый вопрос" });
    const edited = await prisma.pickerRound.findUniqueOrThrow({ where: { id: firstRoundId } });
    expect(edited.prompt).toBe("Обновлённый вопрос");

    // delete_round removes a round (clean scenarios): add a throwaway, delete it.
    const { roundId: tmpRoundId } = await call("add_round", { projectId, prompt: "Черновик" });
    expect(await prisma.pickerRound.count({ where: { projectId } })).toBe(3);
    await call("delete_round", { roundId: tmpRoundId });
    expect(await prisma.pickerRound.count({ where: { projectId } })).toBe(2);
    expect(await prisma.pickerRound.findUnique({ where: { id: tmpRoundId } })).toBeNull();
  }, 60_000);
});

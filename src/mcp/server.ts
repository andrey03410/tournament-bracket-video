import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveActor, type Actor } from "@/mcp/actor";
import { can, quotasFor } from "@/lib/domain/permissions";
import { search, findStudio, studioAnimes, animeCharacters, importPoster } from "@/server/shikimori";
import {
  createProject, getProject, addRound, patchRound, deleteRound, addTile, patchTile, patchProject, setPlaylist,
} from "@/server/projects";
import { addTileFromShikimori } from "@/mcp/compose";
import { importYoutubeAudio } from "@/mcp/youtube";
import { projectSummary } from "@/mcp/project-summary";
import type { ShikimoriType } from "@/lib/domain/shikimori";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
});
const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ error: message }) }],
  isError: true,
});

/** Wrap a handler so service-layer throws become tool errors, not crashes. */
function guard(fn: () => Promise<unknown>): Promise<ToolResult> {
  return fn().then(ok).catch((e) => fail((e as Error)?.message ?? String(e)));
}

async function main() {
  const actor: Actor = await resolveActor();
  const maxPoolBytes = quotasFor(actor.role).maxPoolBytes;
  const canUpload = can(actor.role, "media:upload");
  const uid = actor.userId;

  const server = new McpServer({ name: "tournament-bracket-video", version: "0.1.0" });

  // ---- Discovery (Shikimori, read-only) ----
  server.registerTool(
    "shikimori_find_studio",
    { description: "Найти студию Shikimori по названию. → [{id, name}]",
      inputSchema: { query: z.string() } },
    ({ query }) => guard(() => findStudio(query)),
  );
  server.registerTool(
    "shikimori_studio_animes",
    { description: "Аниме студии (по умолчанию по популярности). → [{id, type:'anime', label, posterPath, facts}]",
      inputSchema: { studioId: z.number(), order: z.string().optional(), limit: z.number().optional() } },
    ({ studioId, order, limit }) => guard(() => studioAnimes(studioId, { order, limit })),
  );
  server.registerTool(
    "shikimori_anime_characters",
    { description: "Персонажи аниме (по умолчанию только Main). → [{id, type:'character', label, posterPath}]",
      inputSchema: { animeId: z.number(), role: z.enum(["Main", "all"]).optional() } },
    ({ animeId, role }) => guard(() => animeCharacters(animeId, { role })),
  );
  server.registerTool(
    "shikimori_search",
    { description: "Поиск аниме или персонажа по названию. → [{id, type, label, posterPath, facts}]",
      inputSchema: { type: z.enum(["anime", "character"]), query: z.string() } },
    ({ type, query }) => guard(() => search(type, query)),
  );

  // ---- Pool imports ----
  server.registerTool(
    "import_shikimori_poster",
    { description: "Импортировать постер (аниме/персонаж) в пул как картинку. → {artId}",
      inputSchema: { type: z.enum(["anime", "character"]), id: z.number(), posterPath: z.string(), label: z.string().optional() } },
    ({ type, id, posterPath, label }) =>
      !canUpload ? Promise.resolve(fail("Импорт медиа недоступен вашей роли"))
        : guard(() => importPoster(uid, { type: type as ShikimoriType, id, posterPath, label: label ?? null, maxPoolBytes })),
  );
  server.registerTool(
    "import_youtube_audio",
    { description: "Скачать звук с YouTube (yt-dlp) в пул. Дожидается завершения. → {artId}",
      inputSchema: { url: z.string() } },
    ({ url }) =>
      !canUpload ? Promise.resolve(fail("Импорт медиа недоступен вашей роли"))
        : guard(() => importYoutubeAudio(uid, { url, maxPoolBytes })),
  );

  // ---- Picker building ----
  server.registerTool(
    "create_picker_project",
    { description: "Создать проект «Пикер». Стартует с одним пустым раундом (firstRoundId) и включёнными интро/аутро (титульный и финальный экраны по 3 сек). Пустая строка в introText/outroText выключает экран. → {projectId, firstRoundId}",
      inputSchema: {
        title: z.string(),
        orientation: z.enum(["landscape", "portrait"]).optional(),
        introText: z.string().optional(),
        outroText: z.string().optional(),
      } },
    ({ title, orientation, introText, outroText }) => guard(async () => {
      const project = await createProject(uid, title, "picker");
      if (orientation != null || introText !== undefined || outroText !== undefined) {
        await patchProject(uid, project.id, {
          ...(orientation != null ? { tileOrientation: orientation } : {}),
          ...(introText !== undefined
            ? { introText, introEnabled: introText.trim() !== "" }
            : {}),
          ...(outroText !== undefined
            ? { outroText, outroEnabled: outroText.trim() !== "" }
            : {}),
        });
      }
      const loaded = await getProject(uid, project.id);
      return { projectId: project.id, firstRoundId: loaded!.rounds[0]?.id ?? null };
    }),
  );
  server.registerTool(
    "add_round",
    { description: "Добавить раунд в пикер. Необязательные поля настраивают вопрос/таймер/показ ответа/подписи/ориентацию. → {roundId}",
      inputSchema: {
        projectId: z.string(),
        prompt: z.string().optional(),
        timerSec: z.number().optional(),
        revealSec: z.number().optional(),
        labelsMode: z.enum(["always", "finale", "never"]).optional(),
        orientation: z.enum(["landscape", "portrait"]).optional(),
      } },
    ({ projectId, prompt, timerSec, revealSec, labelsMode, orientation }) => guard(async () => {
      const round = await addRound(uid, projectId);
      if (prompt != null || timerSec != null || revealSec != null || labelsMode != null || orientation != null) {
        await patchRound(uid, round.id, {
          ...(prompt != null ? { prompt, showPrompt: true } : {}),
          ...(timerSec != null ? { timerSec } : {}),
          ...(revealSec != null ? { revealSec } : {}),
          ...(labelsMode != null ? { labelsMode } : {}),
          ...(orientation != null ? { tileOrientation: orientation } : {}),
        });
      }
      return { roundId: round.id };
    }),
  );
  server.registerTool(
    "add_tile",
    { description: "Добавить плитку из уже импортированного арта (image/video) в раунд. → {tileId}",
      inputSchema: {
        roundId: z.string(), artId: z.string(), label: z.string().optional(), isAnswer: z.boolean().optional(),
        fitMode: z.enum(["cover", "fill", "contain"]).optional(),
      } },
    ({ roundId, artId, label, isAnswer, fitMode }) => guard(async () => {
      const tile = await addTile(uid, roundId, artId);
      if (label != null || isAnswer || fitMode != null) {
        await patchTile(uid, tile.id, {
          ...(label != null ? { label } : {}),
          ...(isAnswer ? { isAnswer: true } : {}),
          ...(fitMode != null ? { fitMode } : {}),
        });
      }
      return { tileId: tile.id };
    }),
  );
  server.registerTool(
    "add_tile_from_shikimori",
    { description: "Импортировать постер Shikimori и добавить плиткой в раунд одним вызовом. → {tileId, artId}",
      inputSchema: {
        roundId: z.string(), type: z.enum(["anime", "character"]), id: z.number(),
        posterPath: z.string(), label: z.string().optional(), isAnswer: z.boolean().optional(),
        fitMode: z.enum(["cover", "fill", "contain"]).optional(),
      } },
    ({ roundId, type, id, posterPath, label, isAnswer, fitMode }) =>
      !canUpload ? Promise.resolve(fail("Импорт медиа недоступен вашей роли"))
        : guard(async () => {
            const result = await addTileFromShikimori(uid, {
              roundId, type: type as ShikimoriType, id, posterPath,
              label: label ?? null, isAnswer, maxPoolBytes,
            });
            if (fitMode != null) {
              await patchTile(uid, result.tileId, { fitMode });
            }
            return result;
          }),
  );
  server.registerTool(
    "set_playlist",
    { description: "Задать фоновую музыку пикера (упорядоченные id аудио-артов). → {ok:true}",
      inputSchema: { projectId: z.string(), artIds: z.array(z.string()) } },
    ({ projectId, artIds }) => guard(async () => { await setPlaylist(uid, projectId, artIds); return { ok: true }; }),
  );
  server.registerTool(
    "get_project",
    { description: "Прочитать структуру проекта (раунды/плитки/ответы/плейлист) для самопроверки. → summary",
      inputSchema: { projectId: z.string() } },
    ({ projectId }) => guard(async () => {
      const p = await getProject(uid, projectId);
      if (!p) throw new Error("Проект не найден");
      return projectSummary(p);
    }),
  );
  server.registerTool(
    "set_round",
    { description: "Изменить существующий раунд (промпт/таймер/подписи/ориентацию). Пустой prompt (\"\") убирает вопрос; orientation:null снимает оверрайд. → {ok:true}",
      inputSchema: {
        roundId: z.string(),
        prompt: z.string().optional(),
        timerSec: z.number().optional(),
        revealSec: z.number().optional(),
        labelsMode: z.enum(["always", "finale", "never"]).optional(),
        orientation: z.enum(["landscape", "portrait"]).nullable().optional(),
      } },
    ({ roundId, prompt, timerSec, revealSec, labelsMode, orientation }) => guard(async () => {
      await patchRound(uid, roundId, {
        ...(prompt !== undefined ? { prompt, showPrompt: prompt.trim() !== "" } : {}),
        ...(timerSec != null ? { timerSec } : {}),
        ...(revealSec != null ? { revealSec } : {}),
        ...(labelsMode != null ? { labelsMode } : {}),
        ...(orientation !== undefined ? { tileOrientation: orientation } : {}),
      });
      return { ok: true };
    }),
  );
  server.registerTool(
    "delete_round",
    { description: "Удалить раунд пикера (например пустой стартовый, чтобы сценарий был чистым). → {ok:true}",
      inputSchema: { roundId: z.string() } },
    ({ roundId }) => guard(async () => { await deleteRound(uid, roundId); return { ok: true }; }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // Startup failure (e.g. actor unresolved): report on stderr and exit non-zero.
  process.stderr.write(`MCP server failed to start: ${(err as Error)?.message ?? err}\n`);
  process.exit(1);
});

# Спецификация 10 — MCP-сервер: ИИ сам собирает пикер

Статус: согласовано с владельцем продукта (2026-07-14). **Реализация отложена** —
спека фиксирует продуктовые и технические решения для будущей фазы 10.

## Цель

Приложение отдаёт свои возможности как **MCP-сервер**, чтобы внешний ИИ-клиент
(Claude Desktop / Claude Code) мог **сам, на своё усмотрение**, собрать
видео-проект «Пикер»: найти материал в Shikimori, импортировать постеры/аудио в
пул и разложить их по раундам с назначением «ответа».

Эталонный сценарий: «Собери пикер персонажей студии Madhouse, по 4 варианта,
10 раундов» — ИИ сам выбирает аниме студии, набирает главных персонажей,
формирует раунды и помечает правильный ответ. Инструменты **общие**, поэтому тем
же набором собираются и другие сценарии («топ опенингов», «угадай персонажа по
жанру», «лучшее за сезон» и т. п.) — специализация живёт в промпте/усмотрении
клиента, не в коде.

## Согласованные решения

| Вопрос            | Решение                                                             |
|-------------------|---------------------------------------------------------------------|
| Топология         | Приложение = **MCP-сервер**; ИИ = **внешний** MCP-клиент (Claude Desktop/Code). Наших LLM-ключей нет |
| Репо / язык       | **Этот репо, TypeScript**; отдельный Node-entrypoint, импортирует `src/server/*` напрямую |
| SDK / транспорт   | `@modelcontextprotocol/sdk`, `McpServer` + `StdioServerTransport` (stdio), схемы инструментов на zod |
| Идентичность      | env `MCP_ACTOR_EMAIL` → сервер резолвит `userId` на старте; права/квоты через `can()`/`quotasFor(role)` |
| Скоуп фазы 10     | **Пикер целиком, без рендера**: Shikimori-discovery + импорт постеров/аудио + создание пикера (раунды/плитки/ответ/музыка) |
| YouTube           | **Свой инструмент** поверх существующего `startDownload` (yt-dlp, фаза 8) |
| Рендер            | Не экспонируется: инструмент возвращает `/projects/<id>`, пользователь ревьюит и рендерит в UI |
| Реюз              | Ноль дублирования — все операции идут через существующий сервисный слой (та же БД, квоты, сторедж) |

## Осуществимость (проверено вживую 2026-07-14)

- Shikimori: `/api/studios` → Madhouse id=11; `/api/animes?studio=11&order=popularity`
  → аниме студии; `/api/animes/:id/roles` → персонажи с ролью `Main` и картинками.
  Сценарий Madhouse полностью покрывается публичным REST v1.
- Сервисный слой уже фреймворк-независим: `createProject / addRound / patchRound /
  addTile / patchTile / reorderTiles / setPlaylist` (`src/server/projects.ts`),
  `search / importPoster` (`src/server/shikimori.ts`), `startDownload`
  (`src/server/downloads.ts`). MCP-инструменты — тонкий адаптер над ними,
  параллельно HTTP-роутам.

## Архитектура

```
src/mcp/
  server.ts        # bootstrap: McpServer + StdioServerTransport + резолв актора
  actor.ts         # MCP_ACTOR_EMAIL -> userId (+ роль/права/квоты)
  tools/
    shikimori.ts   # discovery + импорт постеров (над src/server/shikimori.ts)
    youtube.ts     # import_youtube_audio (над src/server/downloads.ts)
    picker.ts      # create/add_round/add_tile/... (над src/server/projects.ts)
```

- `package.json`: скрипт `mcp` (`tsx src/mcp/server.ts`); `tsx` в devDeps.
- **Рантайм-нюанс:** `src/server/*` начинаются с `import "server-only"`, который
  бросает вне RSC-бандла. MCP-процесс — обычный Node, поэтому нужен тот же приём,
  что уже применён в тестах: алиас `server-only` → `src/test/server-only-stub.ts`
  (через tsx-loader / `tsconfig-paths`). Prisma и `.env` (DATABASE_URL,
  SHIKIMORI_*, YTDLP_*) — те же, что у приложения.
- Ошибки инструментов возвращаются как текстовый JSON с человекочитаемым
  сообщением (квота/права/невалидный ввод), не роняя сессию MCP.

## Инструменты (каждый возвращает JSON)

**Discovery (Shikimori, read-only):**
- `shikimori_find_studio(query)` → `[{id, name}]`
- `shikimori_studio_animes(studioId, {order?, limit?})` → аниме студии
- `shikimori_anime_characters(animeId, {role?: "Main"|"all"})` → персонажи с `posterPath`
- `shikimori_search(type, query)` → существующий `search` (аниме/персонажи)

**Пул:**
- `import_shikimori_poster({type, id, posterPath, label?})` → `{artId}`
  (существующий `importPoster`, с квотой пула)
- `import_youtube_audio({url})` → обёртка над `startDownload` (audio-режим);
  поллит DownloadJob до `done`/`failed` и возвращает `{artId}` либо ошибку

**Сборка пикера (над `projects.ts`):**
- `create_picker_project({title})` → `{projectId}`
- `add_round({projectId, prompt?, timerSec?, revealSec?, labelsMode?})` → `{roundId}`
- `add_tile({roundId, artId, label?, isAnswer?})` → `{tileId}`
  (валидации ≤9 плиток и «один ответ» — уже в сервисе)
- `add_tile_from_shikimori({roundId, type, id, posterPath, label?, isAnswer?})`
  — композит: импорт постера + плитка одним вызовом (меньше round-trip’ов агента)
- `set_playlist({projectId, artIds})` — фоновая музыка пикера
- `get_project({projectId})` — read-back структуры для самопроверки ИИ

Гранулярность: инструменты мелкие (ИИ решает состав сам), но есть композиты
против сотен вызовов. Рендер намеренно не экспонируется.

## Эталонный поток (Madhouse)

`shikimori_find_studio("Madhouse")` → id 11 → `shikimori_studio_animes(11,
popularity)` → по набранным аниме `shikimori_anime_characters(id, "Main")` →
`create_picker_project("Персонажи Madhouse")` → ×10 `add_round` + по 4
`add_tile_from_shikimori` (один `isAnswer:true`) → опц. `import_youtube_audio` +
`set_playlist` → `get_project` для сверки → ссылка `/projects/<id>`.

## Тесты (для фазы реализации)

- **Юнит:** маппинг discovery-ответов Shikimori (studios / anime roles → Main),
  сборка аргументов инструментов.
- **Интеграция** (реальная БД + локальный HTTP-Shikimori, паттерн фазы 9):
  вызвать хендлеры инструментов напрямую → пикер со всеми раундами/плитками/
  ответом реально создан в БД; квоты и права соблюдены; изоляция актора.
- **E2E MCP:** поднять сервер по stdio, `list_tools` + прогон сценария Madhouse
  через MCP-клиент SDK, проверить проект в БД; ручной прогон реальным ИИ из
  Claude Code.

## Вне скоупа фазы 10

- In-app агент («✨ Сгенерировать с ИИ» на сайте, наш Anthropic-ключ).
- Рендер через MCP; создание «ручного топа» через MCP.
- Мультипользовательский HTTP/Streamable-транспорт, OAuth-идентичность.
- Внешний YouTube-MCP (поиск по названию) — пока только импорт по URL.
- Кэш/дедуп постеров, произвольные фильтры Shikimori сверх студии/жанра/поиска.

## Риски

- Rate-limit Shikimori при массовом наборе (10×4 = 40 постеров) — троттлинг/пауза
  в discovery/импорте.
- Долгие YouTube-загрузки в синхронном инструменте — поллинг с таймаутом и
  понятной ошибкой в ответе.
- Bootstrap `server-only` в Node-процессе — единственная нетривиальная часть
  настройки; закрывается алиасом на существующий стаб.

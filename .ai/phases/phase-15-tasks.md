# Фаза 15 — локальные медиа и оформление проекта в MCP — план реализации

**Goal:** Внешний ИИ может оформить пикер целиком: взять арт из пула, поставить
задний фон, залить локальные OST-файлы и собрать из них плейлист.

**Architecture:** Политика доступа к диску — чистый модуль
`lib/domain/local-media.ts` (allowlist + резолв пути, без fs), работа с файлами —
`server/local-media.ts` поверх существующего `createArtFromFile`, наружу —
четыре инструмента в `mcp/server.ts`. Спека:
[`.ai/specs/15-mcp-local-media.md`](../specs/15-mcp-local-media.md).

## Global Constraints

- **Оригиналы пользователя неприкосновенны**: `createArtFromFile` перемещает
  источник, поэтому импорт всегда работает с копией в `storage/tmp`.
- **Никакого доступа за allowlist**: проверка пути дважды — как задан и после
  `realpath` (симлинк не должен выводить наружу).
- **Права и квоты как у остальных импортов**: `media:upload` + `maxPoolBytes`.
- **Публичный контракт существующих инструментов не меняется.**
- **Перед авторитетным `npm test` останавливать dev-сервер** (общий `prisma/dev.db`).

## Задачи

- [x] **Task 1: Политика доступа.** `lib/domain/local-media.ts`
  (`parseMediaDirs`, `resolveInsideDirs`, `localMediaKind`) + юнит-тесты;
  `IMG_EXT` переезжает в `lib/upload.ts` и реэкспортируется из `server/arts.ts`.
- [x] **Task 2: Сервис.** `server/local-media.ts`: `mediaDirs`, `listLocalMedia`,
  `importLocalMedia` (`{items, failed}`), уборка temp-копий при ошибке.
- [x] **Task 3: Инструменты MCP.** `list_pool`, `list_local_media`,
  `import_local_media`, `set_project` (в т.ч. `backgroundArtId`).
- [x] **Task 4: Тесты.** Юнит + интеграция на реальных файлах + MCP e2e через
  stdio-клиент; `.env.example` и README получают `MCP_LOCAL_MEDIA_DIRS`.
- [x] **Task 5: Живая проверка.** Через MCP оформлен «Kiss / Marry / Kill —
  30 раундов»: фон «Нагиса с зонтиком» из пула (все 30 раундов наследуют его),
  плейлист под фактические 6:42 (таймер стал 5 сек): Everyday Leisure 1:51 →
  Summertime 2:44 → Summer Lights 2:58 = 7:33, три кюя без лупа; оригиналы
  файлов в папке ost на месте.

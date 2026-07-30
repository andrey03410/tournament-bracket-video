# Фаза 13 — список и избранное пользователя Shikimori в MCP — план реализации

**Goal:** Дать внешнему ИИ доступ к данным конкретного пользователя Shikimori:
его список аниме с оценками и статусами и его избранное — чтобы собирать топы и
пикеры из того, что этот человек реально смотрел.

**Architecture:** Три слоя как в фазе 9: чистые мапперы/селекторы в
`lib/domain/shikimori.ts`, сетевые вызовы в `lib/shikimori.ts`, DTO-сервис в
`server/shikimori.ts`, тонкие инструменты в `mcp/server.ts`. Список берётся одним
запросом целиком, фильтрация/сортировка — локальные и чистые (тестируются без
сети).

Спека: [`.ai/specs/13-shikimori-user-lists.md`](../specs/13-shikimori-user-lists.md).

## Global Constraints

- **Только чтение**: новые инструменты ничего не пишут в пул/проекты.
- **`posterPath` из выдачи обязан годиться для `import_shikimori_poster`** —
  избранное отдаёт только `x64`, поэтому путь переписывается в `original`;
  плейсхолдер «нет арта» становится `null`.
- **SSRF-гард не ослабляется**: `resizeImagePath` возвращает только
  `/system/(animes|characters)/…` пути, всё остальное — `null`.
- **Лимит запросов Shikimori (~5 rps)**: запросы сериализуются с паузой,
  429 повторяется с бэкоффом, после лимита — явная ошибка `RATE_LIMITED`.
- **Русские описания инструментов** (их читает внешний ИИ), латиница в полях.
- **Перед авторитетным `npm test` останавливать dev-сервер** (общий `prisma/dev.db`).

## Задачи

- [x] **Task 1: Доменный слой.** `mapUser`, `mapUserRate`, `selectUserRates`,
  `countByStatus`, `extractFavourites`, `resizeImagePath`; прогон путей картинок
  в `mapAnimeResult`/`mapCharacterResult` через `resizeImagePath`. Юнит-тесты.
- [x] **Task 2: Сетевой слой.** `fetchUserRaw` (ник/id), `fetchUserAnimeRatesRaw`,
  `fetchUserFavouritesRaw`; троттлинг + ретрай 429 в `getJson`.
- [x] **Task 3: Сервис.** `findUser` (404 → `USER_NOT_FOUND`), `userAnimeList`
  (фильтры, порядок, `total`/`countsByStatus`/`matched`, лимит ≤ 500, `kind` в
  DTO), `userFavourites` (аниме + персонажи).
- [x] **Task 4: MCP-инструменты.** `shikimori_find_user`,
  `shikimori_user_anime_list`, `shikimori_user_favourites` с русскими
  описаниями статусов/порядков и подсказкой про `kind: music`.
- [x] **Task 5: Тесты.** Юнит + интеграция на локальном HTTP-стенде (включая
  ретрай 429 и импорт постера избранного) + MCP e2e-сценарий «из списка юзера».
  `npm test` — 325 зелёных.
- [x] **Task 6: Живая проверка.** Реальный профиль `andrey03410`: сервисный
  смоук и прогон по MCP-протоколу против shikimori.io (443 записи, сводка по
  статусам, 61 избранный персонаж, импорт постера, `USER_NOT_FOUND` для
  несуществующего ника). Найдено и исправлено по живым данным: плейсхолдер
  `missing_original.jpg` и 429 при серии запросов.
- [x] **Task 7: Документация.** Спека 13, этот план, README (таблица
  инструментов + сценарий), CLAUDE.md, заметки в skill `verify`.

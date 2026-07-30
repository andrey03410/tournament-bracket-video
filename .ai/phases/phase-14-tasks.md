# Фаза 14 — лимиты Shikimori и свежие постеры — план реализации

**Goal:** Сделать интеграцию с Shikimori пригодной для агентских сценариев на
сотни запросов и импортировать тот постер, который реально показан на сайте.

**Architecture:** Политика лимитов — чистый модуль `lib/domain/rate-limit.ts`
(тестируется без таймеров и сети), применение — в общем `getJson` из
`lib/shikimori.ts`. Свежий постер — GraphQL `poster.originalUrl` с
SSRF-гардом `isSafePosterUrl` и откатом на legacy `/system`-копию.

Спека: [`.ai/specs/14-shikimori-robustness.md`](../specs/14-shikimori-robustness.md).

## Global Constraints

- **Оба лимита Shikimori**: 5 rps и 90 rpm. Клиент держит 250 мс и 80 запросов в
  минуту (запас), 429 повторяется 2 с / 8 с / 20 с с приоритетом `Retry-After`.
- **Картинки не тратят минутный бюджет API** — иначе импорт 150 постеров
  растянется на минуты без причины.
- **Гард на URL постера не ослабляет SSRF-защиту**: только тот же origin, что у
  `SHIKIMORI_BASE_URL`, и только путь `/uploads/poster/...`.
- **Фолбэк обязателен**: нет свежего URL / ошибка / чужой хост → legacy
  `/system`-копия, как раньше. Публичный контракт MCP не меняется.
- **Перед авторитетным `npm test` останавливать dev-сервер** (общий `prisma/dev.db`).

## Задачи

- [x] **Task 1: Политика лимитов.** `lib/domain/rate-limit.ts`
  (`nextDelayMs`, `trimHistory`, `retryDelayMs`) + юнит-тесты.
- [x] **Task 2: Применение в клиенте.** Скользящее окно и пауза в `throttle`,
  разделение `api`/`asset`, расписание повторов, тестовый хук
  `SHIKIMORI_RETRY_MS`.
- [x] **Task 3: Свежие постеры.** `isSafePosterUrl` (домен), `fetchGraphql`,
  `fetchFreshPosterUrls`, `fetchPosterByUrl`; `importPoster` берёт свежий URL
  (или переданный `posterUrl`) с откатом на legacy.
- [x] **Task 4: Тесты.** Юнит на гард и политику; интеграция на локальном
  стенде: свежие байты вместо legacy, `posterUrl` без лишнего GraphQL, три
  фолбэка, ретрай 429 и исчерпание бюджета. `npm test` — 339 зелёных.
- [x] **Task 5: Живая проверка.** Реальные URL постеров через GraphQL, импорт
  «Атака титанов» 685×975 (371 КБ) вместо 225×350 (57 КБ), персонаж — актуальная
  ревизия файла.
- [x] **Task 6: Документация.** Спека 14, этот план, README, CLAUDE.md,
  заметки в skill `verify`.

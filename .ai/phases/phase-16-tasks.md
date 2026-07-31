# Фаза 16 — групповое сравнение в пикере — план реализации

**Goal:** Раунд умеет быть сравнением 2–3 блоков карточек (3v3, 2v2v2, 3v2,
1v3) — красиво в кадре, собираемо в конструкторе и через MCP.

**Architecture:** Геометрия и таймлайн — чистые модули (`picker-layout.ts`,
`picker-plan.ts`), состояние — новая таблица `PickerGroup` и `PickerRound.mode`,
сервисный слой в `server/projects.ts`, кадр — панели блоков в `PickerVideo.tsx`.
Спека: [`.ai/specs/16-group-comparison.md`](../specs/16-group-comparison.md).

## Global Constraints

- **Обычные раунды не меняются**: `mode="single"` — дефолт БД, старые проекты
  работают как раньше (тот же план, тот же кадр).
- **Один размер карточки на раунд** — сравнение не должно быть визуально
  нечестным.
- **Кропы не сбрасываются**: пропорция карточки остаётся пропорцией ориентации.
- **Лимиты жёсткие на сервисном слое**: ≤ 3 блоков, ≤ 5 карточек в блоке,
  ≤ 15 карточек в раунде; рендер требует ≥ 2 блоков и непустых блоков.
- **Перед авторитетным `npm test` останавливать dev-сервер** (общий `prisma/dev.db`).
- Каждая задача закрывается тестами и уходит в `main` отдельным коммитом.

## Задачи

- [x] **Task 1: Геометрия.** `groupLayout(counts, orientation)` в
  `lib/domain/picker-layout.ts` + юнит-тесты (симметрия, асимметрия, выбор
  разбиения, портрет, границы зоны).
- [x] **Task 2: Схема и сервис.** `PickerRound.mode`, таблица `PickerGroup`,
  `PickerTile.groupId`; `setRoundMode`, `addGroup`, `patchGroup`, `deleteGroup`,
  `moveTileToGroup`, `addTile` в блок; лимиты + `invalidRounds`. Интеграционные
  тесты на реальной БД.
- [ ] **Task 3: Таймлайн.** `PlanRound.mode`/`groups` и математика группового
  раунда в `lib/domain/picker-plan.ts` + `buildPickerPreviewPlan` + юнит-тесты.
- [ ] **Task 4: Кадр.** Панель блока (рамка, название, свечение ответа), знак VS,
  каскад карточек в `remotion/PickerVideo.tsx`; подготовка ассетов по блокам в
  `server/picker-render.ts`; headless-рендер 3v2 и 2v2v2 с проверкой кадров.
- [ ] **Task 5: Конструктор.** Переключатель режима, колонки блоков, перенос
  карточек стрелками, название и отметка ответа, подсказки валидации;
  UI-прогон в headless Chrome.
- [ ] **Task 6: MCP.** `add_group`/`set_group`/`delete_group`, `mode` в
  `add_round`, `groupId` в `add_tile`/`add_tile_from_shikimori`, блоки в
  `get_project` + e2e через stdio.
- [ ] **Task 7: Документация и финальная проверка.** README (таблица
  инструментов + описание режима), `CLAUDE.md`, статус спеки; полный `npm test`,
  живой прогон.

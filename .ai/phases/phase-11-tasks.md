# Фаза 11 — вертикальные плашки + вертикальная сетка — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать плашкам пикера вертикальную ориентацию (2:3) в дополнение к 16:9,
с раскладкой «Ростер» для 2–9 плашек и потайловым режимом вписывания
(cover/fill/contain), чтобы постеры Shikimori показывались без сильной обрезки.
Кадр видео остаётся 16:9.

**Architecture:** Ориентация — enum на проекте (дефолт) с оверрайдом на раунде;
`fitMode` — enum на плитке. Раскладка обобщается на аспект плашки; рендер уже
позиционируется по нормализованным rect'ам, так что портретные rect'ы просто
иначе посчитаны. Всё поверх существующего сервисного слоя и Remotion-композиции.

**Tech Stack:** TypeScript, Prisma/SQLite, Remotion, react-easy-crop, Vitest.

Спека: [`.ai/specs/11-vertical-tiles.md`](../specs/11-vertical-tiles.md).

## Global Constraints

- **Обратная совместимость через дефолты.** Новые поля: `VideoProject.tileOrientation
  @default("landscape")`, `PickerRound.tileOrientation String?` (null=наследует),
  `PickerTile.fitMode @default("cover")`. Существующие проекты ведут себя как раньше.
- **Инвариант landscape.** Для `landscape` раскладка обязана давать те же rect'ы,
  что и сейчас (`w == h`); существующие тесты `picker-layout.test.ts` не меняются
  и должны проходить.
- **Значения enum'ов ровно эти:** ориентация `"landscape" | "portrait"`; fitMode
  `"cover" | "fill" | "contain"`. Валидация — в сервисном слое (паттерн `labelsMode`
  из `patchRound`).
- **Аспекты:** landscape плашка 16:9, portrait плашка **2:3**. Нормализованное
  отношение `k = tileAspect / (16/9)` → landscape `k=1`, portrait `k=(2/3)/(16/9)=0.375`;
  `h = w / k`.
- **Эффективная ориентация раунда** = `round.tileOrientation ?? project.tileOrientation`.
- **Смена ориентации сбрасывает несовместимые кропы** затрагиваемых плиток в null
  (16:9-кроп геометрически неверен для 2:3), в той же транзакции.
- **При `fitMode ≠ "cover"` покадровый crop игнорируется** (показывается весь кадр).
- **Скоуп — только пикер** (не «Ручной топ»); вывод видео остаётся 16:9.
- **Русские пользовательские строки**; имена полей/значений — латиницей.
- **Перед авторитетным `npm test` останавливать dev-сервер** (общий `prisma/dev.db`).

## File Structure

Изменяется:
- `src/lib/domain/picker-layout.ts` (+ тип `TileOrientation`, `rowSplit(count,orientation)`,
  `pickerLayout(count,orientation)`, `effectiveOrientation`).
- `src/lib/domain/picker-layout.test.ts` (+ портретные тесты).
- `src/lib/domain/art-crop.ts` (+ тип `FitMode`, `artCropStyle(crop, fitMode)`).
- `src/lib/domain/art-crop.test.ts` (+ fit-режимы).
- `src/lib/domain/picker-plan.ts` (+ `fitMode`/`orientation` в input/plan, раскладка по ориентации).
- `src/lib/domain/picker-plan.test.ts`.
- `src/lib/domain/video-plan.ts` (`SegmentVisual.fitMode?`).
- `prisma/schema.prisma` (3 поля) + `prisma db push`.
- `src/server/projects.ts` (patch* новые поля + сброс кропа + эффективная ориентация).
- `src/integration/projects.integration.test.ts`.
- `src/server/picker-render.ts` (протянуть ориентацию/fitMode в план).
- `src/remotion/PickerVideo.tsx` (fitMode → artCropStyle).
- `src/mcp/server.ts` (+ orientation/fitMode в инструментах).
- `src/integration/mcp.e2e.test.ts` (портретный сценарий).
- `src/app/tournaments/[id]/render/ArtGalleryModal.tsx` (проп `aspect`).
- `src/app/projects/[id]/PickerConstructor.tsx` (селекторы + аспект кропа + fitMode).
- `src/app/globals.css` (аспект превью-плиток по ориентации).
- `README.md`, `CLAUDE.md` (документация + счётчик тестов).

---

## Task 1: Раскладка — обобщение на ориентацию

**Files:**
- Modify: `src/lib/domain/picker-layout.ts`
- Test: `src/lib/domain/picker-layout.test.ts`

**Interfaces:**
- Produces:
  - `export type TileOrientation = "landscape" | "portrait"`
  - `rowSplit(count: number, orientation?: TileOrientation): number[]`
  - `pickerLayout(count: number, orientation?: TileOrientation): TileRect[]`
  - `effectiveOrientation(round: TileOrientation | null | undefined, project: TileOrientation | null | undefined): TileOrientation`

- [ ] **Step 1: Написать падающие тесты**

Добавить в `src/lib/domain/picker-layout.test.ts` (импорт расширить на
`TileOrientation`, `effectiveOrientation`):

```ts
import { pickerLayout, rowSplit, effectiveOrientation } from "./picker-layout";

describe("portrait layout", () => {
  const AR = 2 / 3; // pixel aspect w:h
  const FRAME = 16 / 9;
  // pixel aspect of a rect in a 16:9 frame = (w/h) * (16/9)
  const pxAspect = (r: { w: number; h: number }) => (r.w / r.h) * FRAME;

  it("row split follows the roster table", () => {
    expect(rowSplit(6, "portrait")).toEqual([6]);
    expect(rowSplit(9, "portrait")).toEqual([5, 4]);
    expect(rowSplit(7, "portrait")).toEqual([4, 3]);
  });

  for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
    it(`n=${n}: all rects are 2:3 and inside the frame`, () => {
      const rects = pickerLayout(n, "portrait");
      expect(rects).toHaveLength(n);
      for (const r of rects) {
        expect(pxAspect(r)).toBeCloseTo(AR, 2); // portrait tiles are 2:3
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-6);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-6);
      }
    });
  }

  it("centers a single row horizontally", () => {
    const rects = pickerLayout(2, "portrait");
    const leftGap = rects[0].x;
    const rightGap = 1 - (rects[1].x + rects[1].w);
    expect(leftGap).toBeCloseTo(rightGap, 3);
  });
});

describe("landscape layout is unchanged", () => {
  it("defaults to landscape and keeps square rects", () => {
    const def = pickerLayout(4);
    const land = pickerLayout(4, "landscape");
    expect(def).toEqual(land);
    for (const r of land) expect(r.w).toBeCloseTo(r.h, 6); // 16:9 tile in 16:9 frame
  });
});

describe("effectiveOrientation", () => {
  it("round override wins, else project, else landscape", () => {
    expect(effectiveOrientation("portrait", "landscape")).toBe("portrait");
    expect(effectiveOrientation(null, "portrait")).toBe("portrait");
    expect(effectiveOrientation(null, null)).toBe("landscape");
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run src/lib/domain/picker-layout.test.ts`
Expected: FAIL — `pickerLayout` не принимает orientation / нет `effectiveOrientation`.

- [ ] **Step 3: Реализовать**

Переписать `src/lib/domain/picker-layout.ts` (сохранив существующий экспорт
`TileRect`, `MIN_TILES`, `MAX_TILES`):

```ts
// Tile layouts for the picker mode: 2–9 tiles arranged in centered rows.
// All rects are normalized fractions of the 16:9 frame.

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TileOrientation = "landscape" | "portrait";

export const MIN_TILES = 2;
export const MAX_TILES = 9;

const FRAME_ASPECT = 16 / 9;
// Pixel aspect (w:h) of one tile. Landscape matches the frame; portrait is 2:3.
const TILE_ASPECT: Record<TileOrientation, number> = {
  landscape: 16 / 9,
  portrait: 2 / 3,
};

/** Row split per tile count, per orientation. */
export function rowSplit(count: number, orientation: TileOrientation = "landscape"): number[] {
  if (orientation === "portrait") {
    switch (count) {
      case 2: return [2];
      case 3: return [3];
      case 4: return [4];
      case 5: return [5];
      case 6: return [6];
      case 7: return [4, 3];
      case 8: return [4, 4];
      case 9: return [5, 4];
      default: throw new Error("BAD_TILE_COUNT");
    }
  }
  switch (count) {
    case 2: return [2];
    case 3: return [3];
    case 4: return [2, 2];
    case 5: return [3, 2];
    case 6: return [3, 3];
    case 7: return [4, 3];
    case 8: return [4, 4];
    case 9: return [3, 3, 3];
    default: throw new Error("BAD_TILE_COUNT");
  }
}

const ZONE_TOP = 0.2;
const ZONE_BOTTOM = 0.97;
const ZONE_LEFT = 0.03;
const ZONE_RIGHT = 0.97;
const GAP = 0.02; // between tiles, both axes

/**
 * Rects for `count` tiles in reading order (left-to-right, top-to-bottom).
 * Incomplete rows are horizontally centered; the grid is vertically centered
 * inside the tile zone. Tile shape follows `orientation`.
 */
export function pickerLayout(
  count: number,
  orientation: TileOrientation = "landscape",
): TileRect[] {
  const rows = rowSplit(count, orientation);
  const maxCols = Math.max(...rows);
  const zoneW = ZONE_RIGHT - ZONE_LEFT;
  const zoneH = ZONE_BOTTOM - ZONE_TOP;

  // Normalized width:height ratio of a tile: k = tileAspect / frameAspect.
  // landscape -> 1 (w == h); portrait (2:3) -> 0.375 (tall).
  const k = TILE_ASPECT[orientation] / FRAME_ASPECT;

  // Pick the largest tile width w that fits both axes; height h = w / k.
  const w = Math.min(
    (zoneW - (maxCols - 1) * GAP) / maxCols,
    (k * (zoneH - (rows.length - 1) * GAP)) / rows.length,
  );
  const h = w / k;

  const gridH = rows.length * h + (rows.length - 1) * GAP;
  const top = ZONE_TOP + (zoneH - gridH) / 2;

  const rects: TileRect[] = [];
  rows.forEach((cols, r) => {
    const rowW = cols * w + (cols - 1) * GAP;
    const left = ZONE_LEFT + (zoneW - rowW) / 2;
    for (let c = 0; c < cols; c++) {
      rects.push({ x: left + c * (w + GAP), y: top + r * (h + GAP), w, h });
    }
  });
  return rects;
}

/** Effective orientation of a round: its own override, else the project default. */
export function effectiveOrientation(
  round: TileOrientation | null | undefined,
  project: TileOrientation | null | undefined,
): TileOrientation {
  return round ?? project ?? "landscape";
}
```

- [ ] **Step 4: Запустить — убедиться, что проходят**

Run: `npx vitest run src/lib/domain/picker-layout.test.ts`
Expected: PASS (портретные + прежние landscape).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/picker-layout.ts src/lib/domain/picker-layout.test.ts
git commit -m "Phase 11: picker layout generalized to tile orientation (roster grid)"
```

---

## Task 2: Режимы вписывания в art-crop

**Files:**
- Modify: `src/lib/domain/art-crop.ts`
- Test: `src/lib/domain/art-crop.test.ts`

**Interfaces:**
- Produces:
  - `export type FitMode = "cover" | "fill" | "contain"`
  - `artCropStyle(crop: ArtCrop | null, fitMode?: FitMode): Record<string, string>`

- [ ] **Step 1: Написать падающие тесты**

Добавить в `src/lib/domain/art-crop.test.ts` (импорт расширить на `FitMode` при
необходимости):

```ts
describe("artCropStyle fit modes", () => {
  it("defaults to cover (unchanged behavior)", () => {
    expect(artCropStyle(null)).toEqual({ width: "100%", height: "100%", objectFit: "cover" });
  });
  it("fill stretches and ignores the crop", () => {
    const s = artCropStyle({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, "fill");
    expect(s).toEqual({ width: "100%", height: "100%", objectFit: "fill" });
  });
  it("contain letterboxes and ignores the crop", () => {
    const s = artCropStyle({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, "contain");
    expect(s).toEqual({ width: "100%", height: "100%", objectFit: "contain" });
  });
  it("cover with a crop keeps the positioning behavior", () => {
    const s = artCropStyle({ x: 0, y: 0, w: 0.5, h: 0.5 }, "cover");
    expect(s.position).toBe("absolute");
    expect(s.width).toBe("200%");
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run src/lib/domain/art-crop.test.ts`
Expected: FAIL — `artCropStyle` не принимает второй аргумент / нет обработки fill/contain.

- [ ] **Step 3: Реализовать**

В `src/lib/domain/art-crop.ts` добавить тип и обновить `artCropStyle`:

```ts
export type FitMode = "cover" | "fill" | "contain";
```

Заменить функцию `artCropStyle`:

```ts
/**
 * CSS for an <img>/<video> inside a relatively-positioned, overflow-hidden
 * container. `cover` (default) keeps the existing crop/cover behavior; `fill`
 * stretches to the container (ignoring the crop); `contain` letterboxes the
 * whole frame (ignoring the crop). Used by the Remotion composition and the
 * constructor thumbnails so the picture is identical everywhere.
 */
export function artCropStyle(
  crop: ArtCrop | null,
  fitMode: FitMode = "cover",
): Record<string, string> {
  if (fitMode === "fill") return { width: "100%", height: "100%", objectFit: "fill" };
  if (fitMode === "contain") return { width: "100%", height: "100%", objectFit: "contain" };
  if (!crop) return { width: "100%", height: "100%", objectFit: "cover" };
  return {
    position: "absolute",
    width: pct(1 / crop.w),
    height: pct(1 / crop.h),
    left: pct(-crop.x / crop.w),
    top: pct(-crop.y / crop.h),
    maxWidth: "none",
  };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходят**

Run: `npx vitest run src/lib/domain/art-crop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/art-crop.ts src/lib/domain/art-crop.test.ts
git commit -m "Phase 11: artCropStyle fit modes (cover/fill/contain)"
```

---

## Task 3: План пикера — ориентация и fitMode

**Files:**
- Modify: `src/lib/domain/video-plan.ts`
- Modify: `src/lib/domain/picker-plan.ts`
- Test: `src/lib/domain/picker-plan.test.ts`

**Interfaces:**
- Consumes: `pickerLayout(count, orientation)`, `TileOrientation` (Task 1); `FitMode` (Task 2).
- Produces:
  - `SegmentVisual.fitMode?: FitMode` (optional; default cover downstream).
  - `PlanTileInput.fitMode: FitMode`.
  - `PlanRoundInput.orientation: TileOrientation`.
  - `buildPickerPlan` использует `pickerLayout(count, round.orientation)` и кладёт
    `visual.fitMode = tile.fitMode`.

- [ ] **Step 1: Написать падающий тест**

Добавить в `src/lib/domain/picker-plan.test.ts` (в существующие импорты добавить
`TileOrientation` при необходимости; собрать вход по образцу существующих тестов
файла — см. как там строится `PlanRoundInput`):

```ts
it("uses the round orientation for the layout and carries fitMode", () => {
  const plan = buildPickerPlan(
    { revealSec: 3, hideAfterReveal: false, timerSec: 5, tickSound: false },
    [
      {
        prompt: null, showPrompt: false, labelsMode: "always",
        revealSec: null, hideAfterReveal: null, timerSec: null,
        bg: null, bgMusic: null,
        orientation: "portrait",
        tiles: [
          { media: { kind: "image", ref: "a", posterRef: null, durationSec: null, hasAudio: false }, crop: null, startSec: null, label: "A", isAnswer: true, playSound: false, fitMode: "contain" },
          { media: { kind: "image", ref: "b", posterRef: null, durationSec: null, hasAudio: false }, crop: null, startSec: null, label: "B", isAnswer: false, playSound: false, fitMode: "cover" },
        ],
      },
    ],
  );
  const round = plan.rounds[0];
  // portrait 2 tiles -> 2:3 rects (w/h * 16/9 ≈ 0.667)
  const r0 = round.tiles[0].rect;
  expect((r0.w / r0.h) * (16 / 9)).toBeCloseTo(2 / 3, 2);
  expect(round.tiles[0].visual.fitMode).toBe("contain");
  expect(round.tiles[1].visual.fitMode).toBe("cover");
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run src/lib/domain/picker-plan.test.ts`
Expected: FAIL — типы не содержат `orientation`/`fitMode`; раскладка не портретная.

- [ ] **Step 3: Реализовать типы**

В `src/lib/domain/video-plan.ts`, в `interface SegmentVisual` добавить поле (импортировать `FitMode`):

```ts
  /** How the media fills the tile: cover (default) / fill / contain. */
  fitMode?: FitMode;
```

(добавить `import type { FitMode } from "./art-crop";` рядом с существующим импортом `ArtCrop`.)

В `src/lib/domain/picker-plan.ts`:
- добавить импорт: `import { pickerLayout, type TileRect, type TileOrientation } from "./picker-layout";` (расширить существующий), и `import type { FitMode } from "./art-crop";` (рядом с `ArtCrop`).
- в `PlanTileInput` добавить `fitMode: FitMode;`.
- в `PlanRoundInput` добавить `orientation: TileOrientation;`.

- [ ] **Step 4: Реализовать раскладку и проброс fitMode**

В `buildPickerPlan`, заменить строку раскладки:

```ts
    const rects = pickerLayout(Math.max(2, Math.min(9, round.tiles.length)), round.orientation);
```

В сборке `visual` добавить `fitMode`:

```ts
      const visual: SegmentVisual = {
        kind: tile.media.kind,
        path: tile.media.ref,
        crop: tile.crop,
        startSec: footage.startSec,
        loopSec: footage.loopSec,
        fitMode: tile.fitMode,
      };
```

- [ ] **Step 5: Запустить — убедиться, что проходят**

Run: `npx vitest run src/lib/domain/picker-plan.test.ts src/lib/domain/video-plan.test.ts`
Expected: PASS. Если `video-plan.test.ts` требует `fitMode` в своих `SegmentVisual`-фикстурах — не требует, поле optional; убедиться, что тесты зелёные.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/video-plan.ts src/lib/domain/picker-plan.ts src/lib/domain/picker-plan.test.ts
git commit -m "Phase 11: picker plan carries orientation + tile fitMode"
```

---

## Task 4: Схема БД + сервисный слой

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/server/projects.ts`
- Test: `src/integration/projects.integration.test.ts`

**Interfaces:**
- Consumes: `effectiveOrientation`, `TileOrientation` (Task 1); `FitMode` (Task 2).
- Produces (расширение существующих):
  - `ProjectPatch.tileOrientation?: unknown`
  - `RoundPatch.tileOrientation?: unknown` (строка или null = сброс оверрайда)
  - `TilePatch.fitMode?: unknown`

- [ ] **Step 1: Добавить поля в схему и применить**

В `prisma/schema.prisma`:
- в `model VideoProject` добавить: `tileOrientation String @default("landscape")`
- в `model PickerRound` добавить: `tileOrientation String?`
- в `model PickerTile` добавить: `fitMode String @default("cover")`

Run:
```bash
npm run db:push && npm run db:generate
```
Expected: schema applied, client regenerated. (Дефолты не ломают существующие строки.)

- [ ] **Step 2: Написать падающие интеграционные тесты**

Добавить в `src/integration/projects.integration.test.ts` (следовать
существующему стилю файла: создать проект-пикер, раунд, плитку с картинкой-артом,
задать кроп; хелперы/фикстуры уже есть в файле). Тесты:

```ts
describe("phase 11: orientation + fitMode", () => {
  it("patchProject validates and stores tileOrientation", async () => {
    // создать пикер-проект p (см. существующие хелперы файла)
    await patchProject(userId, p.id, { tileOrientation: "portrait" });
    const fresh = await getProject(userId, p.id);
    expect(fresh!.tileOrientation).toBe("portrait");
    await expect(patchProject(userId, p.id, { tileOrientation: "diagonal" }))
      .rejects.toThrow("BAD_ORIENTATION");
  });

  it("patchRound override + reset (null) works", async () => {
    // раунд r в пикере p
    await patchRound(userId, r.id, { tileOrientation: "portrait" });
    // ...прочитать раунд и проверить "portrait"
    await patchRound(userId, r.id, { tileOrientation: null });
    // ...проверить, что снова null (наследует проект)
  });

  it("patchTile validates and stores fitMode", async () => {
    await patchTile(userId, tile.id, { fitMode: "contain" });
    // ...проверить "contain"
    await expect(patchTile(userId, tile.id, { fitMode: "squish" }))
      .rejects.toThrow("BAD_FIT");
  });

  it("changing a round's effective orientation resets its tiles' crops", async () => {
    // плитка tile с заданным кропом (cropX..cropH != null) в раунде r (проект landscape)
    await patchTile(userId, tile.id, { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    await patchRound(userId, r.id, { tileOrientation: "portrait" });
    const t = await prisma.pickerTile.findUniqueOrThrow({ where: { id: tile.id } });
    expect(t.cropX).toBeNull();
    expect(t.cropW).toBeNull();
  });

  it("changing project orientation resets crops of tiles in rounds without an override", async () => {
    // проект landscape, раунд без оверрайда, плитка с кропом
    await patchTile(userId, tile.id, { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    await patchProject(userId, p.id, { tileOrientation: "portrait" });
    const t = await prisma.pickerTile.findUniqueOrThrow({ where: { id: tile.id } });
    expect(t.cropX).toBeNull();
  });
});
```

(Точные имена хелперов/переменных — по образцу существующих тестов файла; при
необходимости импортировать `patchProject/patchRound/patchTile/getProject` и `prisma`.)

- [ ] **Step 3: Запустить — убедиться, что падают**

Run: `npx vitest run src/integration/projects.integration.test.ts`
Expected: FAIL — patch* не знают новых полей / нет сброса кропа.

- [ ] **Step 4: Реализовать в `src/server/projects.ts`**

Импорты: добавить `effectiveOrientation, type TileOrientation` из `@/lib/domain/picker-layout`.

Валидаторы-константы (рядом с `LIMITS`):

```ts
const ORIENTATIONS = ["landscape", "portrait"] as const;
const FIT_MODES = ["cover", "fill", "contain"] as const;
const isOrientation = (v: unknown): v is TileOrientation =>
  typeof v === "string" && (ORIENTATIONS as readonly string[]).includes(v);
```

В `interface ProjectPatch` добавить `tileOrientation?: unknown;`.
В `interface RoundPatch` добавить `tileOrientation?: unknown;`.
В `interface TilePatch` добавить `fitMode?: unknown;`.

Хелпер сброса кропа (рядом с прочими helpers):

```ts
const CROP_RESET = { cropX: null, cropY: null, cropW: null, cropH: null };

/** Reset crops of tiles whose effective orientation just changed. */
async function resetCropsForRounds(roundIds: string[]) {
  if (roundIds.length === 0) return;
  await prisma.pickerTile.updateMany({
    where: { roundId: { in: roundIds } },
    data: CROP_RESET,
  });
}
```

В `patchProject`, обработать `tileOrientation` (после `ownedProject`, до `update`):

```ts
  if (patch.tileOrientation !== undefined) {
    if (!isOrientation(patch.tileOrientation)) throw new Error("BAD_ORIENTATION");
    data.tileOrientation = patch.tileOrientation;
  }
```

И — сброс кропов у плиток раундов БЕЗ собственного оверрайда, если эффективная
ориентация меняется. Реализовать в `patchProject` перед `prisma.videoProject.update`:
получить текущий проект (`ownedProject` уже возвращает его — использовать его
`tileOrientation` как старое значение), и если новое != старое, найти раунды без
оверрайда и сбросить их кропы:

```ts
  // (внутри блока обработки tileOrientation, когда значение реально меняется)
  const project = await ownedProject(userId, id); // уже вызывается в начале — переиспользовать
  if (isOrientation(patch.tileOrientation) && patch.tileOrientation !== project.tileOrientation) {
    const rounds = await prisma.pickerRound.findMany({
      where: { projectId: id, tileOrientation: null },
      select: { id: true },
    });
    await resetCropsForRounds(rounds.map((r) => r.id));
  }
```

> Примечание реализатору: `patchProject` уже вызывает `ownedProject(userId, id)` в
> начале и возвращает его результат. Возьми это значение в переменную (`const project
> = await ownedProject(...)`) и используй его `tileOrientation` как «старое».

В `patchRound`, обработать `tileOrientation` и сброс кропов при смене эффективной
ориентации раунда. `ownedRound` возвращает раунд с `project`. Логика:

```ts
  if (patch.tileOrientation !== undefined) {
    if (patch.tileOrientation !== null && !isOrientation(patch.tileOrientation))
      throw new Error("BAD_ORIENTATION");
    const oldEff = effectiveOrientation(
      round.tileOrientation as TileOrientation | null,
      round.project.tileOrientation as TileOrientation,
    );
    const newEff = effectiveOrientation(
      (patch.tileOrientation as TileOrientation | null) ?? null,
      round.project.tileOrientation as TileOrientation,
    );
    data.tileOrientation = patch.tileOrientation; // string | null
    if (oldEff !== newEff) await resetCropsForRounds([round.id]);
  }
```

(`ownedRound` уже включает `tiles` и `project` — см. текущую реализацию.)

В `patchTile`, обработать `fitMode`:

```ts
  if (patch.fitMode !== undefined) {
    if (!(FIT_MODES as readonly string[]).includes(String(patch.fitMode)))
      throw new Error("BAD_FIT");
    data.fitMode = patch.fitMode;
  }
```

- [ ] **Step 5: Запустить — убедиться, что проходят**

Run: `npx vitest run src/integration/projects.integration.test.ts`
Expected: PASS (dev-сервер остановлен).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/server/projects.ts src/integration/projects.integration.test.ts
git commit -m "Phase 11: schema + service for orientation/fitMode (+ crop reset on switch)"
```

---

## Task 5: Рендер-пайплайн (picker-render + PickerVideo)

**Files:**
- Modify: `src/server/picker-render.ts`
- Modify: `src/remotion/PickerVideo.tsx`

**Interfaces:**
- Consumes: `PlanRoundInput.orientation`, `PlanTileInput.fitMode`, `SegmentVisual.fitMode`,
  `effectiveOrientation` (Tasks 1–3).

- [ ] **Step 1: Протянуть ориентацию/fitMode в план (picker-render.ts)**

`picker-render.ts` строит `PlanRoundInput[]`/`PlanTileInput[]` из строк БД в двух
местах (превью-поток ~стр.82 и рендер-поток ~стр.207). В обоих:
- импортировать `effectiveOrientation` из `@/lib/domain/picker-layout`;
- для каждого раунда добавить в объект `PlanRoundInput`:
  `orientation: effectiveOrientation(round.tileOrientation, project.tileOrientation)`
  (значения приходят из включённых строк project/round; привести типы к
  `TileOrientation | null`/`TileOrientation` как в сервисе);
- для каждой плитки добавить `fitMode: tile.fitMode as FitMode` (импортировать `FitMode`
  из `@/lib/domain/art-crop`).

> Реализатору: свериться с фактической формой запросов (где грузятся project и
> round). Проект уже загружается для дефолтов; убедиться, что `tileOrientation`
> выбирается (скалярные колонки приходят по умолчанию, если нет явного `select`).

- [ ] **Step 2: Передать fitMode в artCropStyle (PickerVideo.tsx)**

В `src/remotion/PickerVideo.tsx`:
- `TileMedia`: заменить `artCropStyle(tile.visual.crop)` на
  `artCropStyle(tile.visual.crop, tile.visual.fitMode)` (в обеих ветках — video и img).
- `TileStill`: для картинок используется `TileMedia`, наследует. Для видео-постера
  (`objectFit:"cover"`) оставить как есть.

- [ ] **Step 3: Проверить сборку и план-тесты**

Run: `npx vitest run src/lib/domain/picker-plan.test.ts && npx tsc --noEmit`
Expected: PASS, типы сходятся.

- [ ] **Step 4: Commit**

```bash
git add src/server/picker-render.ts src/remotion/PickerVideo.tsx
git commit -m "Phase 11: render pipeline threads orientation + fitMode end to end"
```

---

## Task 6: MCP — параметры ориентации и fitMode

**Files:**
- Modify: `src/mcp/server.ts`
- Test: `src/integration/mcp.e2e.test.ts`

**Interfaces:**
- Consumes: `patchProject`, `patchRound`, `patchTile` (Task 4); существующие MCP-инструменты (фаза 10).

- [ ] **Step 1: Расширить E2E портретным сценарием**

В `src/integration/mcp.e2e.test.ts`, во втором тесте, после создания проекта и
раундов, задать ориентацию и fitMode и проверить в БД. Добавить в сценарий:
- `create_picker_project` вызвать с `{ title, orientation: "portrait" }`;
- один `add_tile_from_shikimori` вызвать с `fitMode: "contain"`;
- после `get_project` проверить в БД:

```ts
    const proj = await prisma.videoProject.findUniqueOrThrow({ where: { id: projectId } });
    expect(proj.tileOrientation).toBe("portrait");
    const answerTile = await prisma.pickerTile.findFirstOrThrow({
      where: { round: { projectId }, fitMode: "contain" },
    });
    expect(answerTile.fitMode).toBe("contain");
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run src/integration/mcp.e2e.test.ts`
Expected: FAIL — инструменты игнорируют новые параметры.

- [ ] **Step 3: Реализовать в `src/mcp/server.ts`**

- Импортировать `patchProject` из `@/server/projects` (если ещё не импортирован).
- `create_picker_project`: добавить в `inputSchema` `orientation: z.enum(["landscape","portrait"]).optional()`; в обработчике после `createProject`, если `orientation` задан, вызвать `await patchProject(uid, project.id, { tileOrientation: orientation })` до чтения `getProject`.
- `add_round`: добавить в `inputSchema` `orientation: z.enum(["landscape","portrait"]).optional()`; в обработчике добавить в объект `patchRound` `...(orientation != null ? { tileOrientation: orientation } : {})` (и вызывать patchRound, даже если задан только orientation — расширить условие).
- `add_tile`: добавить в `inputSchema` `fitMode: z.enum(["cover","fill","contain"]).optional()`; в обработчике добавить в `patchTile` `...(fitMode != null ? { fitMode } : {})` (расширить условие вызова patchTile).
- `add_tile_from_shikimori`: добавить `fitMode` в `inputSchema` и пробросить в `addTileFromShikimori`… — но `addTileFromShikimori` (compose.ts) не принимает fitMode. Проще: после композита, если `fitMode != null`, вызвать `await patchTile(uid, result.tileId, { fitMode })`. Реализовать в обработчике инструмента (patchTile уже импортирован в server.ts).

- [ ] **Step 4: Запустить — убедиться, что проходят**

Run: `npx vitest run src/integration/mcp.e2e.test.ts`
Expected: PASS (dev-сервер остановлен; таймауты 60s сохранены).

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts src/integration/mcp.e2e.test.ts
git commit -m "Phase 11: MCP tools accept orientation + fitMode"
```

---

## Task 7: UI конструктора + аспект кропа

**Files:**
- Modify: `src/app/tournaments/[id]/render/ArtGalleryModal.tsx`
- Modify: `src/app/projects/[id]/PickerConstructor.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `artCropStyle(crop, fitMode)` (Task 2); `effectiveOrientation` (Task 1);
  API поля `tileOrientation` (проект/раунд), `fitMode` (плитка) — приходят из
  `GET /api/projects/[id]` (скалярные колонки после Task 4).

- [ ] **Step 1: Проп `aspect` у кроппера (ArtGalleryModal.tsx)**

- Добавить в пропсы компонента необязательный `aspect?: number` (дефолт `16 / 9`).
- Заменить `aspect={16 / 9}` на `aspect={aspect}` в `<Cropper>`.
- Проверить, что все существующие вызовы `ArtGalleryModal` без `aspect` продолжают
  работать (дефолт 16/9 — прежнее поведение).

- [ ] **Step 2: PickerConstructor — типы и эффективная ориентация**

- Расширить локальные типы: у проекта `tileOrientation: "landscape" | "portrait"`,
  у раунда `tileOrientation: "landscape" | "portrait" | null`, у плитки
  `fitMode: "cover" | "fill" | "contain"`.
- Импортировать `effectiveOrientation` из `@/lib/domain/picker-layout`.
- Хелпер: `const roundOrientation = (round) => effectiveOrientation(round.tileOrientation, project.tileOrientation)`.
- Хелпер аспекта: `const aspectOf = (o) => (o === "portrait" ? 2 / 3 : 16 / 9)`.

- [ ] **Step 3: PickerConstructor — селекторы ориентации**

- На уровне проекта (рядом с revealSec/timerSec, ~стр.298–319) добавить `<select>`:
  значения landscape/portrait; `onChange={(e) => void patchProject({ tileOrientation: e.target.value })}`;
  `value={project.tileOrientation}`.
- На уровне раунда (рядом с labelsMode, ~стр.466) добавить `<select>` с опциями
  «Как у проекта» (value `""` → патч `null`), landscape, portrait;
  `value={round.tileOrientation ?? ""}`;
  `onChange={(e) => void patchRound(round.id, { tileOrientation: e.target.value === "" ? null : e.target.value })}`.

- [ ] **Step 4: PickerConstructor — fitMode на плитке + аспект кропа + превью**

- На плитке добавить `<select>` fitMode (cover/fill/contain):
  `value={tile.fitMode}`; `onChange={(e) => void patchTile(tile.id, { fitMode: e.target.value })}`.
- Превью плитки (стр.559/561/565): `artCropStyle(tile.crop)` → `artCropStyle(tile.crop, tile.fitMode)`.
- Кнопку/действие «кроп» (открытие модалки `kind:"crop"`) прятать/дизейблить, если
  `tile.fitMode !== "cover"`.
- При открытии кроп-модалки и при выборе арта (pick-поток) передавать
  `aspect={aspectOf(roundOrientation(round))}` в `ArtGalleryModal` (стр.716–723 —
  туда, где рендерится модалка; определить раунд, к которому относится модалка).

> Реализатору: модалка одна на конструктор; чтобы знать ориентацию для аспекта,
> сохраняй в состоянии модалки `roundId` (для crop он уже есть в тайле; для pick —
> pick привязан к раунду). Прокинь `aspect` в `ArtGalleryModal` из этого раунда.

- [ ] **Step 5: globals.css — аспект превью-плиток**

Превью-плитки пикера, у которых сейчас жёстко `aspect-ratio: 16 / 9` (стр.359 и/или
485 — определить, какие относятся к плиткам пикера, НЕ трогать превью-плеер видео
16:9), сделать зависимыми от ориентации: добавить модификатор-класс (напр.
`.tile-portrait { aspect-ratio: 2 / 3; }`) и вешать его в `PickerConstructor` на
контейнер плитки, когда `roundOrientation(round) === "portrait"`.

> Реализатору: не менять `aspect-ratio` у превью-плеера всего видео (PickerConstructor
> стр.265 — это 16:9 кадр, остаётся).

- [ ] **Step 6: Проверка (сборка + ручной прогон UI)**

- Run: `npx tsc --noEmit` — типы сходятся.
- Ручной прогон (dev-сервер): открыть пикер, переключить проект в portrait,
  убедиться, что плитки стали вертикальными 2:3, сетка «Ростер», кроп-модалка
  открывается с аспектом 2:3, а при fitMode=fill/contain кроп недоступен.
  (Скрин/наблюдение — в отчёт; при желании через skill `verify`.)

- [ ] **Step 7: Commit**

```bash
git add "src/app/tournaments/[id]/render/ArtGalleryModal.tsx" "src/app/projects/[id]/PickerConstructor.tsx" src/app/globals.css
git commit -m "Phase 11: constructor UI — orientation selectors, fitMode, portrait crop aspect"
```

---

## Task 8: Документация + финальная верификация

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Прогнать весь тест-сет**

Остановить dev-сервер, затем `npm test 2>&1 | tail -5`. Все зелёные. Записать
фактическое число тестов `<N>`.

- [ ] **Step 2: Headless-рендер вертикального раунда (skill `verify`)**

По рецепту `.claude/skills/verify/SKILL.md` отрендерить короткий пикер с
`tileOrientation: "portrait"` (2–3 раунда, 4–6 плиток) и проверить кадр: плашки
2:3, раскладка «Ростер», без сильной обрезки; отдельно кадр с плиткой
`fitMode: "contain"` (поля) и `fill` (растянуто). Приложить наблюдение в отчёт.

- [ ] **Step 3: Документация**

- `README.md`: в разделе про пикер добавить абзац про ориентацию плашек
  (landscape/portrait, дефолт проекта + оверрайд раунда) и режим вписывания
  (cover/fill/contain). Если есть таблица MCP-инструментов — отметить новые
  параметры `orientation`/`fitMode`.
- `CLAUDE.md`: в «## Статус» дописать фазу 11 (вертикальные плашки 2:3, сетка
  «Ростер» для 2–9, потайловый fit-режим, ориентация на проекте+раунде) и
  обновить счётчик тестов на `<N>`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Phase 11: docs — vertical tiles, roster grid, fit modes; test count"
```

---

## Self-review заметки (для реализатора)

- Инвариант landscape: Task 1 обязана сохранить прежние rect'ы (`w==h`) — тест на
  это есть.
- Обратная совместимость: дефолты полей БД гарантируют, что старые проекты не
  меняются; проверить, что дефолтные значения приходят в API и рендер.
- Сброс кропа при смене ориентации проверяется двумя путями (оверрайд раунда и
  дефолт проекта) — оба покрыты интеграционными тестами Task 4.
- `SegmentVisual.fitMode` — optional, чтобы не трогать TopVideo и его фикстуры.

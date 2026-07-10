---
name: verify
description: Launch and drive this app end-to-end (login, tournament flow, render constructor UI) to verify changes at the real surface
---

# Проверка изменений вживую

## Запуск

```bash
npm run dev   # http://localhost:3000 (в фоне; лог в файл)
```

После изменений `prisma/schema.prisma`: `npx prisma db push && npx prisma generate`
и **обязательно перезапустить dev-сервер** — работающий процесс держит старый
Prisma-клиент в памяти и падает 500 «Unknown argument <новое поле>».

## Сид данных (готовый завершённый турнир)

```bash
node scripts/e2e-setup.mjs      # пересоздаёт e2e@test.local / password123 + /tmp/e2e/ost.zip
BASE=http://localhost:3000 node scripts/e2e-run.mjs   # логин → ZIP → сравнения → финал → конфиг
# в конце печатает tournament=<id>; конструктор: /tournaments/<id>/render
```

`e2e-setup` удаляет пользователя каскадом — каждый прогон стартует с чистого пула
артов. Для UI-прогонов всегда пересидируй, иначе ожидания по числу карточек врут.

## Драйв UI (headless Chrome)

Playwright/puppeteer в deps нет; есть `puppeteer-core` (devDep) + системный
`/usr/bin/google-chrome`:

```js
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox"],
});
```

- Логин: заполнить `input[name=email|password]` на `/login`, submit, ждать навигацию.
- Скрипт-драйвер должен резолвить `puppeteer-core`: либо класть его рядом с
  `node_modules` проекта, либо `ln -s <project>/node_modules <scratchpad>/node_modules`.
- Модалка артов: `.modal`, карточки `.art-card`, скрытый файл-инпут
  `.modal input[type=file]` → `input.uploadFile(...пути)` (мультизагрузка).
- Кроп: `.cropper-box` (react-easy-crop), зум — `input[type=range]` через нативный
  сеттер + событие `input`; сдвиг — mouse down/move/up по центру бокса.
- `confirm()` удаления: `page.once("dialog", d => d.accept())` **до** клика.
- После «Применить» конфиг перезагружается с ffmpeg-анализом сниппетов — ждать
  селектор (до 20 с), не фикс-таймаут.

Готовый драйвер полного сценария (менеджер → поиск → кроп → сброс → «Недавние»)
лежал в scratchpad сессии 2026-07-10: `ui-verify.mjs` — можно взять за образец.

## HTTP-пробы без браузера

Куки-джарный логин — образец в `scripts/e2e-run.mjs` (`/api/auth/csrf` →
`/api/auth/callback/credentials`). Сервер живёт на 3000, скрипты по умолчанию
ждут 3100 — задавай `BASE`.

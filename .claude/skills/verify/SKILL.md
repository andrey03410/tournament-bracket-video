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

## Видео-фикстуры и готовые драйверы (фаза 4)

Смешанный архив (mp3 + mp4 со звуком/без) и клип для пула генерируются ffmpeg-ом
(`testsrc`/`smptebars`/`sine`) — образец `make-mixed-zip.mjs` в scratchpad сессии
2026-07-10; там же `video-e2e.mjs` (полный HTTP-флоу: смешанный турнир → kinds →
пул-видео с постером → подмена звука/сдвиг/кроп → негативные пробы) и
`video-ui-verify.mjs` (слепой режим прячет видеоряд, менеджер с бейджами,
кроп по `<video>`, переключатель звука).

Гочи:
- 413-лимит нельзя пробить через undici (не даёт подделать Content-Length) —
  бери curl с сессионной кукой (`get-cookie.mjs` печатает Cookie-заголовок).
- Видео в кроп-редакторе декодирует первый кадр ~1 c — скриншот сразу после
  `waitForSelector` будет чёрным; жди `readyState === 4` или 1–2 c.
- Headless-рендер с видео работает: `REMOTION_BROWSER_EXECUTABLE=/usr/bin/google-chrome`
  из `.env`; проверяй результат извлечением кадров из выходного MP4
  (`ffmpeg -ss <t> -i out.mp4 -frames:v 1`).

## Роли и лимиты (фаза 5)

Готовые драйверы в scratchpad сессии 2026-07-10: `roles-e2e.mjs` (гость 401/
редиректы, квоты юзера 1 архив/100 МБ/пул 100 МБ, рендер 403, админка со сменой
ролей без перелогина, удаление юзера) и `roles-ui-verify.mjs` (welcome,
регистрация через UI, скрытая кнопка рендера, кабинет, админка).

Гочи:
- `page.click('button[type="submit"]')` попадает в кнопку «Выйти» топбара —
  она первая submit-кнопка в DOM. Кликай кнопки форм по тексту.
- Фикстура «слишком большого» архива не должна быть ZIP-ом из нулей: deflate
  сожмёт 101 МБ до ~100 КБ и лимит честно пропустит файл. Шли несжатое тело —
  413 срабатывает по Content-Length до разбора архива.
- `e2e-setup.mjs` сидирует e2e@test.local уже с ролью admin (рендер и админка
  доступны); для сценариев с лимитами создавай отдельного юзера роли user.
- Роль читается из БД на каждый запрос: смену роли можно проверять живой
  сессией без перелогина.

## HTTP-пробы без браузера

Куки-джарный логин — образец в `scripts/e2e-run.mjs` (`/api/auth/csrf` →
`/api/auth/callback/credentials`). Сервер живёт на 3000, скрипты по умолчанию
ждут 3100 — задавай `BASE`.

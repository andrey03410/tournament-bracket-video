# Спецификация 08 — Импорт медиа по ссылке (YouTube и другие, yt-dlp)

Статус: согласовано с владельцем продукта (2026-07-13), реализуется в фазе 8.

## Цель

Пользователь вставляет ссылку на видеоролик (YouTube и любые сайты,
поддерживаемые yt-dlp), сервер скачивает его **фоново** в пул медиа.
Паттерн вызова yt-dlp перенят из ytDownloader (aandrew-me/ytdownloader):
spawn бинарника, `-f`-селекторы, `--no-playlist`, `--ffmpeg-location`,
прогресс из stdout, `--print-to-file after_move:filepath`.

## Согласованные решения

| Вопрос              | Решение                                                            |
|---------------------|--------------------------------------------------------------------|
| Бинарник yt-dlp     | env `YTDLP_PATH` → `storage/bin/yt-dlp` (автоскачивание официального релиза с github.com/yt-dlp/yt-dlp при первом использовании); при характерных поломках экстрактора — самообновление `yt-dlp -U` и один ретрай |
| Режимы              | «Видео» (H.264+AAC mp4) и «Только звук» (m4a → аудио в пуле)       |
| Источники           | Любой URL — валидирует сам yt-dlp на этапе метаданных              |
| Плейлисты           | Нет (`--no-playlist`); отдельной итерацией                        |
| Качество            | Выбор 480/720/1080, дефолт 1080; кодеки фиксированы (avc1+mp4a) для совместимости с браузером и рендером |
| Квота               | Оценка размера до старта (`yt-dlp -J`, filesize/filesize_approx) → отказ, если не влезает; `--max-filesize` по остатку квоты как страховка; финальная транзакционная проверка при зачислении в пул |
| UX                  | В менеджере медиа: поле ссылки + режим/качество + список активных загрузок (прогресс, отмена, ошибки); фоновость — модалку можно закрыть |
| Роли                | Пермишен `media:upload`; ≤2 параллельных загрузок на пользователя  |

## Данные

`DownloadJob { id, userId, url, mode "video"|"audio", quality Int (высота),
title?, status "queued"|"running"|"done"|"failed"|"canceled", progress,
error?, artId?, createdAt, updatedAt }`. Отмена убивает процесс yt-dlp
(реестр процессов в памяти) и помечает джобу `canceled`.

## yt-dlp обвязка (`src/lib/ytdlp.ts`)

- `ensureYtDlp()`: env → storage/bin → скачивание релиза (linux-бинарник),
  chmod +x; версия логируется.
- `probeUrl(url)`: `-J --no-playlist` → `{title, durationSec, estimatedBytes}`
  (сумма filesize/filesize_approx выбранных форматов; null, если неизвестно).
- `downloadMedia(url, {mode, quality, maxBytes, dir, onProgress})`:
  - видео: `-f "bestvideo[height<=Q][vcodec^=avc1]+bestaudio[acodec^=mp4a]/
    best[height<=Q][ext=mp4]/best[height<=Q]" --merge-output-format mp4`
  - аудио: `-f "bestaudio[ext=m4a]/bestaudio" -x --audio-format m4a`
  - общие: `--no-playlist --no-mtime --newline --ffmpeg-location <ffmpeg-static>
    -P <tmp> -o "dl.%(ext)s" --print-to-file after_move:filepath <marker>`
    `± --max-filesize <bytes>`
  - прогресс: строки `[download] NN.N%` → onProgress(0..1).
- `looksLikeExtractorBreakage(stderr)` → триггер `-U` + ретрай (один раз).

## Поток

1. POST `/api/downloads {url, mode, quality}` → права, лимит 2 активных,
   создание джобы, фоновый запуск (fire-and-forget как рендер).
2. Джоба: ensure бинарник → probe (title, оценка размера; кривой URL → failed
   с человекочитаемой ошибкой) → проверка остатка квоты по оценке → скачивание
   с прогрессом (0.05–0.9) → `createArtFromFile` (движение файла в пул без
   буферизации в память, та же транзакционная квота, проба/постер/sizeBytes)
   → done с artId.
3. UI поллит `GET /api/downloads` (активные + последние), по done обновляет
   сетку пула; ✕ отменяет (`DELETE /api/downloads/[id]` — kill + canceled;
   для завершённых — удаление записи из списка).

## Тесты

- Юнит: парсер прогресса, разбор `-J` (оценка размера), селекторы форматов,
  детект поломки экстрактора.
- Интеграционные (без внешней сети): yt-dlp скачивает с **локального**
  HTTP-сервера (generic extractor, прямой mp4/mp3) → джоба доходит до done,
  файл в пуле с пробой/постером/размером; квота-отказ по оценке; кривой URL →
  failed; лимит параллельных; отмена; изоляция чужих джоб.
- Вживую: реальный YouTube (видео 480p и «только звук»), UI-прогон
  (ссылка → прогресс → карточка в пуле), негативные пробы.

## Вне скоупа

- Плейлисты, выбор произвольных форматов, cookies/private-видео, прокси,
  сабтитры, диапазоны, автообновление бинарника по расписанию.

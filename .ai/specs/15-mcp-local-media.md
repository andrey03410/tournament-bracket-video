# Спецификация 15 — локальные медиа и оформление проекта в MCP

Статус: согласовано с владельцем продукта (2026-07-31). Реализовано в фазе 15.

## Цель

Через MCP можно было собрать пикер из постеров Shikimori и звука с YouTube, но
нельзя было: 1) взять **уже лежащий в пуле** арт (внешний ИИ не видел пул),
2) поставить проекту **задний фон**, 3) залить **локальные файлы** (папка с OST
на диске). Из-за этого сценарий «собери и оформи пикер целиком через MCP»
обрывался на оформлении: `set_playlist` есть, но артов для него взять негде.

## Согласованные решения

| Вопрос                     | Решение                                                                     |
|----------------------------|-----------------------------------------------------------------------------|
| Чтение пула                | `list_pool({kind?, query?, limit?, cursor?})` поверх существующего `listArts` |
| Опознание арта без подписи | В выдаче отдаётся `filePath` (абсолютный) — клиент со зрением сам смотрит картинку |
| Задний фон                 | Через новый `set_project` (зеркало `set_round`), поле `backgroundArtId`; `null` снимает фон |
| Прочие настройки проекта   | `set_project` закрывает то же, что UI: `title`, `orientation`, `introText`/`outroText`, `revealSec`, `timerSec`, `hideAfterReveal`, `tickSound` |
| Интро/аутро в `set_project`| Как в `create_picker_project`: пустая строка выключает экран, непустая включает |
| Фоновая музыка             | Уже существующий `set_playlist` (упорядоченные аудио-арты)                    |
| Локальный импорт           | `import_local_media({paths[], label?})` + `list_local_media({dir})`          |
| Где разрешено читать       | Allowlist из `MCP_LOCAL_MEDIA_DIRS` (разделитель `:`, поддержка `~/`); пусто → инструменты отвечают ошибкой |
| Защита от выхода из корня  | Путь резолвится (`..` нормализуется) и проверяется по корням дважды: как задан и после `realpath` (симлинки) |
| Оригиналы файлов           | **Не трогаются**: файл копируется в `storage/tmp`, а уже копию забирает `createArtFromFile` (он перемещает источник) |
| Отбор файлов              | Только известные расширения (`IMG_EXT`/`VIDEO_EXT`/`AUDIO_EXT`), без рекурсии, сортировка по имени |
| Частичный успех импорта    | Ответ `{items, failed}`: что импортировалось и что нет (квота/расширение/нет файла) — агент видит обе части |
| Права и квоты              | Импорт под `media:upload` и `maxPoolBytes` роли, как остальные импорты        |
| Скоуп                      | MCP + сервисный слой; UI сайта не меняется                                   |

## Слои

- `src/lib/domain/local-media.ts` (чисто, без fs): `parseMediaDirs` (разбор env,
  `~/` → домашняя папка, нормализация, отсечение относительных путей),
  `resolveInsideDirs` (путь внутри одного из корней или `null`), `localMediaKind`
  (расширение → `image`/`video`/`audio`). Списки расширений живут в
  `src/lib/upload.ts` (туда переехал `IMG_EXT` из `server/arts.ts`).
- `src/server/local-media.ts`: `mediaDirs()` (корни из env), `listLocalMedia`,
  `importLocalMedia` (копия в `storage/tmp` → `createArtFromFile` → уборка).
- `src/mcp/server.ts`: инструменты `list_pool`, `list_local_media`,
  `import_local_media`, `set_project`.

## Сценарий (для внешнего ИИ)

`list_local_media({dir})` → выбрать треки под хронометраж →
`import_local_media({paths})` → `set_playlist({projectId, artIds})`;
фон: `list_pool({kind:"image", query})` (или `import_local_media`) →
`set_project({projectId, backgroundArtId})`.

## Проверка

- Юнит (`src/lib/domain/local-media.test.ts`): разбор allowlist, отказ на
  `..`/чужой корень/похожий префикс (`/ost-evil`), определение типа по имени.
- Интеграция (`src/integration/local-media.integration.test.ts`): реальные файлы
  в temp-папке — листинг отсекает не-медиа, импорт кладёт арт с длительностью и
  **оставляет оригинал на месте**, путь вне allowlist и симлинк наружу отбиты,
  квота и неизвестное расширение уходят в `failed`.
- MCP e2e (`src/integration/mcp.e2e.test.ts`): `list_pool`, `import_local_media`,
  `set_playlist`, `set_project({backgroundArtId})` через stdio-клиент.
- Живая проверка: оформление проекта «Kiss / Marry / Kill — 30 раундов» —
  фон «Нагиса с зонтиком» из пула + плейлист Key под хронометраж 9:12.

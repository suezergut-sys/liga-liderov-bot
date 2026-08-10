# Лига лидеров — игровой Telegram-бот

Прототип системы для финансовой деловой игры: семь отдельных Telegram-ботов обслуживаются единым игровым движком и управляются из общей веб-панели.

## Что реализовано в версии 0.1.0

- семь заранее созданных команд и конфигураций ботов;
- личная привязка капитана по одноразовой deep-link ссылке;
- двухэтапный демонстрационный сценарий с ветвлением;
- выбор, отдельное подтверждение и блокировка решения;
- обязательная загрузка `.xlsx` после подтверждения;
- глобальное открытие этапа и информационный таймер на 10 минут;
- принудительный выбор организатора за отстающую команду;
- панель готовности семи команд и журнал событий;
- видимый статус Telegram-доставки и ручная повторная отправка этапа подключённой команде;
- защита webhook secret и дедупликация Telegram updates;
- demo-режим без Telegram-токенов для локальной проверки интерфейса.

## Хранение игрового состояния

При наличии `DATABASE_URL` игровой API использует `PostgresGameStore`: сессия игры, текущий этап, решения, файлы, привязки капитанов, доставки, аудит и дедупликация Telegram updates сохраняются в Supabase PostgreSQL. Мутации выполняются транзакционно, а пара `botKey + update_id` защищена уникальным ключом базы.

Без `DATABASE_URL` приложение автоматически использует `MemoryGameStore` только в локальной разработке и тестах. Production-сборка или runtime завершаются явной ошибкой конфигурации, чтобы Vercel не запустился со случайно теряемым состоянием.

## Локальный запуск

Требуется Node.js 24+ и pnpm 11.16+.

```bash
pnpm install
pnpm dev
```

Без `.env.local` приложение запускается в demo-режиме и не требует пароля. На карточках команд появляются кнопки симуляции капитана.

## Проверки

```bash
pnpm check
pnpm build
```

GitHub Actions выполняет те же команды для pull request и ветки `main`. Во время статической production-сборки CI получает заведомо нерабочий `DATABASE_URL`; сетевое подключение при build не выполняется, а runtime deployment обязан получить настоящий секрет из Vercel.

Параметры связанного deployment-проекта и production smoke test зафиксированы в `docs/vercel-project-profile.md`.

Живая интеграционная проверка PostgreSQL сбрасывает тестовую игровую сессию до и после сценария. В PowerShell:

```powershell
Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
$env:RUN_DATABASE_INTEGRATION_TESTS='1'
pnpm exec vitest run tests/postgres-store.integration.test.ts
```

## Настройка окружения

Скопируйте `.env.example` в `.env.local` и заполните значения. Не добавляйте `.env.local` в Git.

Для базы используются две строки подключения:

- `DATABASE_URL` — Supabase transaction pooler, применяется приложением и Vercel Functions;
- `DIRECT_URL` — прямое подключение, применяется только для миграций.

Версионируемая начальная миграция находится в `supabase/migrations/20260810_000001_initial_game_schema.sql`. Проверка подключения доступна через `GET /api/health/database` и не раскрывает параметры базы или текст ошибки.

Для каждого бота нужны:

- `TELEGRAM_BOT_N_TOKEN` — токен BotFather;
- `TELEGRAM_BOT_N_WEBHOOK_SECRET` — секрет проверки webhook;
- `TELEGRAM_BOT_N_ACTIVATION_TOKEN` — одноразовый секрет ссылки капитана.

Ссылка для капитана:

```text
https://t.me/<bot_username>?start=<TELEGRAM_BOT_N_ACTIVATION_TOKEN>
```

Webhook после публикации:

```text
https://<production-domain>/api/telegram/team-N
```

При вызове `setWebhook` то же значение `TELEGRAM_BOT_N_WEBHOOK_SECRET` передаётся как `secret_token`.

## Работа с файлами

- принимается только расширение `.xlsx`;
- максимальный размер — 20 МБ, согласно лимиту Telegram Bot API `getFile`;
- при наличии `BLOB_READ_WRITE_TOKEN` файл сохраняется в приватный Vercel Blob;
- без Blob-токена demo-режим сохраняет только Telegram `file_id`.

## Структура

```text
src/app                 Next.js UI и API routes
src/components          клиентская админ-панель
src/lib/scenario.ts     сценарий как данные
src/lib/store           игровой автомат, PostgreSQL-репозиторий и demo-хранилище
src/lib/database.ts      безопасное серверное подключение к PostgreSQL
src/lib/telegram.ts     Telegram Bot API и файлы
supabase/migrations     версионируемые SQL-миграции
tests                   unit-тесты доменной логики и auth
```

Исходные материалы проекта сохранены без изменений:

- `TZ_telegram_bot_finance_game.docx`;
- `Ситуации для игры ЛЛ.xmind`.

## Следующие технические шаги

1. Добавить полные Telegram update fixtures для выбора, подтверждения и загрузки файла.
2. Создать GitHub-репозиторий и preview deployment.
3. Добавить переменные окружения Supabase в Vercel.
4. После настройки семи ботов выполнить production smoke test.

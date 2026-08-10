# Профиль Vercel-проекта

- Production branch: `main`
- Vercel project name: `liga-liderov-bot`
- Vercel project ID: `prj_pegsiC17pXE3nKg1ZSBbSZ4GVi2s`
- Production URL: `https://liga-liderov-bot.vercel.app`
- Framework: Next.js
- Node.js: 24.x
- Build command: `pnpm build` (автоопределение Vercel)
- Quality command: `pnpm check`
- Health checks: `/`, `/api/health/database`, защищённый `/api/dashboard`
- Required migration: `supabase/migrations/20260810_000001_initial_game_schema.sql` — применена
- Scheduled jobs: нет
- Required environment variables: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`
- Optional environment variables: `DIRECT_URL`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_1_*` … `TELEGRAM_BOT_7_*`
- Post-deploy smoke test: вход организатора, загрузка панели семи команд, проверка database health; игровое состояние не изменять без отдельного тестового сеанса

Git integration подключена к `https://github.com/suezergut-sys/liga-liderov-bot`. Preview deployments создаются из pull request; production deployment запускается только из `main` после явно разрешённого merge.

При первичном подключении Vercel автоматически назначил production alias первому deployment из feature-ветки. Production branch в настройках подтверждена как `main`; после разрешённого merge alias должен быть проверен на SHA ветки `main` повторно.

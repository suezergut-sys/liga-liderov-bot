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
- Required migrations:
  - `supabase/migrations/20260810_000001_initial_game_schema.sql` — применена;
  - `supabase/migrations/20260811_000002_final_team_scenarios.sql` — применена;
  - `supabase/migrations/20260811_000003_multistep_scenarios.sql` — требуется перед выпуском версии 0.3.0; в production пока не применена.
- Scheduled jobs: нет
- Required environment variables: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`
- Optional environment variables: `DIRECT_URL`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_1_*` … `TELEGRAM_BOT_7_*`
- Post-deploy smoke test: вход организатора, загрузка панели семи команд, проверка database health; игровое состояние не изменять без отдельного тестового сеанса

Git integration подключена к `https://github.com/suezergut-sys/liga-liderov-bot`. Preview deployments создаются из pull request; после успешных обязательных проверок готовый PR автоматически объединяется с `main`, если пользователь явно не запретил merge для конкретной задачи. Production deployment запускается из `main`.

При первичном подключении Vercel автоматически назначил production alias первому deployment из feature-ветки. Production branch в настройках подтверждена как `main`; после каждого merge alias должен быть проверен на SHA ветки `main` повторно.

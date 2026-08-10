begin;

create extension if not exists pgcrypto;
create schema if not exists app;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists app.teams (
  id text primary key,
  team_number smallint not null unique check (team_number between 1 and 7),
  display_name text not null,
  color text not null check (color in ('red', 'blue')),
  bot_key text not null unique,
  captain_telegram_user_id bigint unique,
  captain_chat_id bigint unique,
  captain_bound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.scenario_versions (
  id text primary key,
  title text not null,
  definition jsonb not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists app.game_sessions (
  id uuid primary key default gen_random_uuid(),
  scenario_version_id text not null references app.scenario_versions(id),
  status text not null default 'waiting' check (status in ('waiting', 'running', 'completed')),
  current_stage_index integer not null default -1 check (current_stage_index >= -1),
  duration_seconds integer not null default 600 check (duration_seconds between 60 and 86400),
  stage_opened_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline_at is null or stage_opened_at is not null),
  check (deadline_at is null or deadline_at > stage_opened_at)
);

create unique index if not exists game_sessions_one_active_idx
  on app.game_sessions ((true))
  where status in ('waiting', 'running');

create table if not exists app.team_stage_progress (
  session_id uuid not null references app.game_sessions(id) on delete cascade,
  team_id text not null references app.teams(id),
  stage_index integer not null check (stage_index >= 0),
  status text not null check (status in ('awaiting-decision', 'decision-selected', 'awaiting-file', 'ready', 'completed')),
  selected_choice_id text,
  selected_source text check (selected_source in ('captain', 'organizer_override')),
  decision_confirmed_at timestamptz,
  file_missing_on_forced_advance boolean not null default false,
  version integer not null default 1 check (version > 0),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, team_id, stage_index),
  check (decision_confirmed_at is null or selected_choice_id is not null),
  check (selected_source is null or selected_choice_id is not null)
);

create table if not exists app.decisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references app.game_sessions(id) on delete cascade,
  team_id text not null references app.teams(id),
  stage_index integer not null check (stage_index >= 0),
  stage_id text not null,
  choice_id text not null,
  source text not null check (source in ('captain', 'organizer_override')),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, team_id, stage_index)
);

create table if not exists app.file_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references app.game_sessions(id) on delete cascade,
  team_id text not null references app.teams(id),
  stage_index integer not null check (stage_index >= 0),
  version integer not null check (version > 0),
  original_name text not null,
  storage_url text not null,
  telegram_file_id text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-fA-F]{64}$'),
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 20971520),
  mime_type text,
  uploaded_at timestamptz not null default now(),
  unique (session_id, team_id, stage_index, version)
);

create table if not exists app.processed_telegram_updates (
  bot_key text not null,
  update_id bigint not null,
  processed_at timestamptz not null default now(),
  primary key (bot_key, update_id)
);

create table if not exists app.admin_commands (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references app.game_sessions(id) on delete cascade,
  command_type text not null check (command_type in ('start', 'advance', 'force-decision', 'resend', 'reset')),
  team_id text references app.teams(id),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'accepted' check (status in ('accepted', 'completed', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists app.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references app.game_sessions(id) on delete cascade,
  team_id text not null references app.teams(id),
  stage_index integer,
  message_kind text not null,
  status text not null check (status in ('sent', 'failed')),
  telegram_message_id bigint,
  error_code text,
  attempted_at timestamptz not null default now()
);

create table if not exists app.audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references app.game_sessions(id) on delete cascade,
  team_id text references app.teams(id),
  actor_type text not null check (actor_type in ('captain', 'organizer', 'system')),
  actor_id text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_stage_progress_status_idx
  on app.team_stage_progress (session_id, stage_index, status);
create index if not exists decisions_team_history_idx
  on app.decisions (team_id, confirmed_at desc);
create index if not exists file_submissions_team_history_idx
  on app.file_submissions (team_id, uploaded_at desc);
create index if not exists delivery_attempts_recent_idx
  on app.delivery_attempts (team_id, attempted_at desc);
create index if not exists audit_events_recent_idx
  on app.audit_events (created_at desc);

drop trigger if exists teams_set_updated_at on app.teams;
create trigger teams_set_updated_at
before update on app.teams
for each row execute function app.set_updated_at();

drop trigger if exists game_sessions_set_updated_at on app.game_sessions;
create trigger game_sessions_set_updated_at
before update on app.game_sessions
for each row execute function app.set_updated_at();

drop trigger if exists team_stage_progress_set_updated_at on app.team_stage_progress;
create trigger team_stage_progress_set_updated_at
before update on app.team_stage_progress
for each row execute function app.set_updated_at();

insert into app.teams (id, team_number, display_name, color, bot_key)
values
  ('team-1', 1, 'Команда 1', 'red', 'team-1'),
  ('team-2', 2, 'Команда 2', 'red', 'team-2'),
  ('team-3', 3, 'Команда 3', 'red', 'team-3'),
  ('team-4', 4, 'Команда 4', 'red', 'team-4'),
  ('team-5', 5, 'Команда 5', 'blue', 'team-5'),
  ('team-6', 6, 'Команда 6', 'blue', 'team-6'),
  ('team-7', 7, 'Команда 7', 'blue', 'team-7')
on conflict (id) do update set
  team_number = excluded.team_number,
  display_name = excluded.display_name,
  color = excluded.color,
  bot_key = excluded.bot_key;

insert into app.scenario_versions (id, title, definition, published_at)
values (
  'prototype-v1',
  'Двухэтапный прототип',
  '{"stageCount":2,"source":"src/lib/scenario.ts"}'::jsonb,
  now()
)
on conflict (id) do nothing;

commit;

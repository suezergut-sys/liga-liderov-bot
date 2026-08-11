begin;

alter table app.decisions
  drop constraint if exists decisions_session_id_team_id_stage_index_key;

-- Разделить ранее подтверждённые составные решения красного Q2 на два шага.
insert into app.decisions (
  session_id, team_id, stage_index, stage_id, choice_id, source, confirmed_at, created_at
)
select
  session_id,
  team_id,
  stage_index,
  'red-q2-yakor-start',
  case choice_id
    when 'hire-now' then 'start-yakor-now'
    when 'gamma-contractors-now' then 'start-yakor-now'
    else 'start-yakor-q3'
  end,
  source,
  confirmed_at,
  created_at
from app.decisions
where stage_id = 'red-q2-staffing-and-yakor-start';

update app.decisions
set
  stage_id = 'red-q2-staffing',
  choice_id = case
    when choice_id in ('hire-now', 'hire-q3') then 'hire-two-consultants'
    else 'use-gamma-contractors'
  end
where stage_id = 'red-q2-staffing-and-yakor-start';

-- Разделить восемь комбинаций синего Q2 на три самостоятельных решения.
insert into app.decisions (
  session_id, team_id, stage_index, stage_id, choice_id, source, confirmed_at, created_at
)
select
  session_id,
  team_id,
  stage_index,
  'blue-q2-vyshka-pr',
  case when choice_id like '%-pr-%' then 'run-pr' else 'skip-pr' end,
  source,
  confirmed_at,
  created_at
from app.decisions
where stage_id = 'blue-q2-vyshka-package';

insert into app.decisions (
  session_id, team_id, stage_index, stage_id, choice_id, source, confirmed_at, created_at
)
select
  session_id,
  team_id,
  stage_index,
  'blue-q2-seller-bonus',
  case when choice_id like '%-bonus' then 'pay-bonus-advance' else 'decline-bonus-advance' end,
  source,
  confirmed_at,
  created_at
from app.decisions
where stage_id = 'blue-q2-vyshka-package';

update app.decisions
set
  stage_id = 'blue-q2-vyshka-hiring',
  choice_id = case
    when choice_id like 'hire-%' then 'hire-consultants'
    else 'do-not-hire-consultants'
  end
where stage_id = 'blue-q2-vyshka-package';

-- Старые идентификаторы красного Q3 противоречили подписям кнопок «Да» и «Нет».
update app.decisions
set choice_id = case choice_id
  when 'keep-profit-target' then 'change-forecast'
  when 'revise-profit-target' then 'keep-forecast'
  else choice_id
end
where stage_id = 'red-q3-profit-target';

-- Неподтверждённые составные выборы продолжаются с первого шага соответствующего этапа.
update app.team_stage_progress
set selected_choice_id = case
  when selected_choice_id in ('hire-now', 'hire-q3') then 'hire-two-consultants'
  when selected_choice_id in ('gamma-contractors-now', 'gamma-contractors-q3') then 'use-gamma-contractors'
  when selected_choice_id like 'hire-%' then 'hire-consultants'
  when selected_choice_id like 'nohire-%' then 'do-not-hire-consultants'
  when selected_choice_id = 'keep-profit-target' then 'change-forecast'
  when selected_choice_id = 'revise-profit-target' then 'keep-forecast'
  else selected_choice_id
end
where status = 'decision-selected';

-- После подтверждения источником истины является app.decisions, а selected_choice_id снова означает только черновой выбор.
update app.team_stage_progress
set
  selected_choice_id = null,
  selected_source = null,
  decision_confirmed_at = null
where status in ('awaiting-file', 'ready', 'completed');

alter table app.decisions
  add constraint decisions_session_team_stage_step_key
  unique (session_id, team_id, stage_index, stage_id);

update app.scenario_versions
set
  title = 'Многошаговые сценарии красных и синих команд',
  definition = '{"stageCount":4,"decisionModel":"multi-step","source":"src/lib/scenario.ts","sourceDocument":"Ситуации для игры_final.xmind","teamBranches":["red","blue"]}'::jsonb,
  published_at = now()
where id = 'prototype-v1';

commit;

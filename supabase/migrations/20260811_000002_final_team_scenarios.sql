update app.scenario_versions
set
  title = 'Сценарии красных и синих команд',
  definition = '{"stageCount":4,"source":"src/lib/scenario.ts","sourceDocument":"Ситуации для игры_final.xmind","teamBranches":["red","blue"]}'::jsonb,
  published_at = now()
where id = 'prototype-v1';

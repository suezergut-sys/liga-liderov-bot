import type { TransactionSql } from "postgres";
import { isDemoMode } from "@/lib/config";
import { getDatabase } from "@/lib/database";
import type {
  AuditEvent,
  DecisionRecord,
  DecisionSource,
  GameSnapshot,
  TeamState,
  TeamStatus,
} from "@/lib/domain/types";
import { getScenarioStage, scenarioLength } from "@/lib/scenario";

const DEFAULT_DURATION_SECONDS = 10 * 60;
const SESSION_LOCK_KEY = "league-leaders-current-session";

type Queryable = TransactionSql;

interface SessionRow {
  id: string;
  status: "waiting" | "running" | "completed";
  current_stage_index: number;
  duration_seconds: number;
  stage_opened_at: Date | string | null;
  deadline_at: Date | string | null;
}

interface TeamRow {
  id: string;
  team_number: number;
  display_name: string;
  color: "red" | "blue";
  bot_key: string;
  captain_telegram_user_id: string | null;
  captain_chat_id: string | null;
}

interface ProgressRow {
  team_id: string;
  status: Exclude<TeamStatus, "waiting">;
  selected_choice_id: string | null;
  selected_source: DecisionSource | null;
  decision_confirmed_at: Date | string | null;
  file_missing_on_forced_advance: boolean;
  last_activity_at: Date | string;
}

interface HistoryRow {
  team_id: string;
  stage_index: number;
  stage_id: string;
  choice_id: string;
  source: DecisionSource;
  confirmed_at: Date | string;
  file_missing_on_forced_advance: boolean | null;
  original_name: string | null;
  storage_url: string | null;
}

interface DeliveryRow {
  team_id: string;
  status: "sent" | "failed";
  error_code: string | null;
  attempted_at: Date | string;
}

interface AuditRow {
  id: string;
  team_id: string | null;
  actor_type: AuditEvent["actor"];
  action: string;
  details: Record<string, unknown>;
  created_at: Date | string;
}

function rows<T>(value: unknown): T[] {
  return value as T[];
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function currentSession(sql: Queryable, lock = false): Promise<SessionRow> {
  if (lock) await sql`select pg_advisory_xact_lock(hashtext(${SESSION_LOCK_KEY}))`;
  const lockClause = lock ? sql`for update` : sql``;
  let existing = rows<SessionRow>(await sql`
    select id, status, current_stage_index, duration_seconds, stage_opened_at, deadline_at
    from app.game_sessions
    order by created_at desc, id desc
    limit 1
    ${lockClause}
  `)[0];
  if (existing) return existing;

  await sql`select pg_advisory_xact_lock(hashtext(${SESSION_LOCK_KEY}))`;
  existing = rows<SessionRow>(await sql`
    select id, status, current_stage_index, duration_seconds, stage_opened_at, deadline_at
    from app.game_sessions
    order by created_at desc, id desc
    limit 1
    for update
  `)[0];
  if (existing) return existing;

  return rows<SessionRow>(await sql`
    insert into app.game_sessions (scenario_version_id, status, current_stage_index, duration_seconds)
    values ('prototype-v1', 'waiting', -1, ${DEFAULT_DURATION_SECONDS})
    returning id, status, current_stage_index, duration_seconds, stage_opened_at, deadline_at
  `)[0];
}

async function addEvent(
  sql: Queryable,
  sessionId: string,
  actor: AuditEvent["actor"],
  action: string,
  teamId?: string,
  details: Record<string, unknown> = {},
) {
  await sql`
    insert into app.audit_events (session_id, team_id, actor_type, action, details)
    values (${sessionId}, ${teamId ?? null}, ${actor}, ${action}, ${sql.json(details as never)})
  `;
}

async function historyForSession(sql: Queryable, sessionId: string): Promise<HistoryRow[]> {
  return rows<HistoryRow>(await sql`
    select
      d.team_id,
      d.stage_index,
      d.stage_id,
      d.choice_id,
      d.source,
      d.confirmed_at,
      p.file_missing_on_forced_advance,
      f.original_name,
      f.storage_url
    from app.decisions d
    left join app.team_stage_progress p
      on p.session_id = d.session_id
      and p.team_id = d.team_id
      and p.stage_index = d.stage_index
    left join lateral (
      select original_name, storage_url
      from app.file_submissions
      where session_id = d.session_id
        and team_id = d.team_id
        and stage_index = d.stage_index
      order by version desc
      limit 1
    ) f on true
    where d.session_id = ${sessionId}
    order by d.team_id, d.stage_index, d.confirmed_at, d.stage_id
  `);
}

function mapHistory(row: HistoryRow): DecisionRecord {
  return {
    stageIndex: row.stage_index,
    stageId: row.stage_id,
    choiceId: row.choice_id,
    source: row.source,
    confirmedAt: iso(row.confirmed_at)!,
    fileName: row.original_name ?? undefined,
    fileUrl: row.storage_url ?? undefined,
    fileMissingOnForcedAdvance: row.file_missing_on_forced_advance ?? false,
  };
}

export async function validateChoice(
  sql: Queryable,
  sessionId: string,
  teamId: string,
  stageIndex: number,
  choiceId: string,
) {
  const history = (await historyForSession(sql, sessionId))
    .filter((row) => row.team_id === teamId)
    .map(mapHistory);
  const team = rows<Pick<TeamRow, "color">>(await sql`
    select color
    from app.teams
    where id = ${teamId}
  `)[0];
  if (!team) throw new Error("Команда не найдена");

  const stage = getScenarioStage({ color: team.color, history } as TeamState, stageIndex);
  if (!stage || !stage.choices.some((choice) => choice.id === choiceId)) {
    throw new Error("Недопустимый вариант");
  }
  return stage;
}

async function openStage(sql: Queryable, sessionId: string, stageIndex: number, durationSeconds: number) {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86_400) {
    throw new Error("Длительность этапа должна быть от 1 до 1440 минут");
  }
  const openedAt = new Date();
  const deadlineAt = new Date(openedAt.getTime() + durationSeconds * 1000);
  await sql`
    update app.game_sessions
    set status = 'running',
        current_stage_index = ${stageIndex},
        duration_seconds = ${durationSeconds},
        stage_opened_at = ${openedAt},
        deadline_at = ${deadlineAt},
        completed_at = null
    where id = ${sessionId}
  `;
  await sql`
    insert into app.team_stage_progress (session_id, team_id, stage_index, status, last_activity_at)
    select ${sessionId}, id, ${stageIndex}, 'awaiting-decision', ${openedAt}
    from app.teams
    on conflict (session_id, team_id, stage_index) do update set
      status = 'awaiting-decision',
      selected_choice_id = null,
      selected_source = null,
      decision_confirmed_at = null,
      file_missing_on_forced_advance = false,
      last_activity_at = excluded.last_activity_at,
      version = app.team_stage_progress.version + 1
  `;

  const teams = rows<Pick<TeamRow, "id" | "color">>(await sql`
    select id, color from app.teams order by team_number
  `);
  const historyRows = await historyForSession(sql, sessionId);
  for (const team of teams) {
    const history = historyRows.filter((item) => item.team_id === team.id).map(mapHistory);
    const stage = getScenarioStage({ color: team.color, history } as TeamState, stageIndex);
    if (stage && stage.choices.length === 0 && stage.fileRequired) {
      await sql`
        update app.team_stage_progress
        set status = 'awaiting-file', version = version + 1
        where session_id = ${sessionId} and team_id = ${team.id} and stage_index = ${stageIndex}
      `;
    }
  }
}

interface FileRow {
  team_id: string;
  original_name: string;
  storage_url: string;
}

export class PostgresGameStore {
  constructor(private readonly sql = getDatabase()) {}

  async reset() {
    await this.sql.begin(async (tx) => {
      const previous = await currentSession(tx, true);
      if (previous.status !== "completed") {
        await tx`
          update app.game_sessions
          set status = 'completed', completed_at = now(), stage_opened_at = null, deadline_at = null
          where id = ${previous.id}
        `;
      }
      await tx`
        update app.teams
        set captain_telegram_user_id = null, captain_chat_id = null, captain_bound_at = null
      `;
      const session = rows<SessionRow>(await tx`
        insert into app.game_sessions (scenario_version_id, status, current_stage_index, duration_seconds)
        values ('prototype-v1', 'waiting', -1, ${DEFAULT_DURATION_SECONDS})
        returning id, status, current_stage_index, duration_seconds, stage_opened_at, deadline_at
      `)[0];
      await addEvent(tx, session.id, "organizer", "game.reset");
    });
  }

  async snapshot(): Promise<GameSnapshot> {
    return this.sql.begin(async (tx) => {
      const session = await currentSession(tx);
      const teams = rows<TeamRow>(await tx`
        select id, team_number, display_name, color, bot_key,
               captain_telegram_user_id::text, captain_chat_id::text
        from app.teams
        order by team_number
      `);
      const progress = session.current_stage_index < 0
        ? []
        : rows<ProgressRow>(await tx`
            select team_id, status, selected_choice_id, selected_source,
                   decision_confirmed_at, file_missing_on_forced_advance, last_activity_at
            from app.team_stage_progress
            where session_id = ${session.id} and stage_index = ${session.current_stage_index}
          `);
      const historyRows = await historyForSession(tx, session.id);
      const currentFiles = session.current_stage_index < 0
        ? []
        : rows<FileRow>(await tx`
            select distinct on (team_id) team_id, original_name, storage_url
            from app.file_submissions
            where session_id = ${session.id} and stage_index = ${session.current_stage_index}
            order by team_id, version desc
          `);
      const deliveries = session.current_stage_index < 0
        ? []
        : rows<DeliveryRow>(await tx`
            select distinct on (team_id) team_id, status, error_code, attempted_at
            from app.delivery_attempts
            where session_id = ${session.id} and stage_index = ${session.current_stage_index}
            order by team_id, attempted_at desc
          `);
      const audit = rows<AuditRow>(await tx`
        select id, team_id, actor_type, action, details, created_at
        from app.audit_events
        where session_id = ${session.id}
        order by created_at desc
        limit 100
      `);

      return {
        game: {
          status: session.status,
          currentStageIndex: session.current_stage_index,
          stageOpenedAt: iso(session.stage_opened_at),
          deadlineAt: iso(session.deadline_at),
          durationSeconds: session.duration_seconds,
        },
        teams: teams.map((team): TeamState => {
          const teamProgress = progress.find((item) => item.team_id === team.id);
          const history = historyRows.filter((item) => item.team_id === team.id).map(mapHistory);
          const currentFile = currentFiles.find((item) => item.team_id === team.id);
          const delivery = deliveries.find((item) => item.team_id === team.id);
          const status: TeamStatus = session.status === "waiting"
            ? "waiting"
            : session.status === "completed"
              ? "completed"
              : teamProgress?.status ?? "awaiting-decision";

          return {
            id: team.id,
            number: team.team_number,
            name: team.display_name,
            color: team.color,
            botKey: team.bot_key,
            captainTelegramUserId: team.captain_telegram_user_id ?? undefined,
            captainChatId: team.captain_chat_id ?? undefined,
            status,
            currentStageIndex: session.current_stage_index,
            selectedChoiceId: teamProgress?.selected_choice_id ?? undefined,
            selectedSource: teamProgress?.selected_source ?? undefined,
            decisionConfirmedAt: iso(teamProgress?.decision_confirmed_at),
            currentFileName: currentFile?.original_name,
            currentFileUrl: currentFile?.storage_url,
            lastActivityAt: iso(teamProgress?.last_activity_at),
            delivery: delivery
              ? { status: delivery.status, at: iso(delivery.attempted_at), error: delivery.error_code ?? undefined }
              : { status: "not-sent" },
            history,
          };
        }),
        audit: audit.map((event) => ({
          id: event.id,
          at: iso(event.created_at)!,
          actor: event.actor_type,
          action: event.action,
          teamId: event.team_id ?? undefined,
          details: event.details,
        })),
        serverNow: new Date().toISOString(),
        demoMode: isDemoMode,
      };
    });
  }

  async getTeam(teamId: string) {
    const team = (await this.snapshot()).teams.find((item) => item.id === teamId);
    if (!team) throw new Error("Команда не найдена");
    return team;
  }

  async getTeamByBotKey(botKey: string) {
    const team = (await this.snapshot()).teams.find((item) => item.botKey === botKey);
    if (!team) throw new Error("Бот не привязан к команде");
    return team;
  }

  async getStage(teamId: string) {
    const team = await this.getTeam(teamId);
    if (team.currentStageIndex < 0) return undefined;
    return getScenarioStage(team, team.currentStageIndex);
  }

  async startGame(durationSeconds = DEFAULT_DURATION_SECONDS) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      if (session.status !== "waiting") throw new Error("Игра уже запущена");
      await openStage(tx, session.id, 0, durationSeconds);
      await addEvent(tx, session.id, "organizer", "stage.opened", undefined, { stageIndex: 0, durationSeconds });
    });
  }

  async advanceGame(durationSeconds = DEFAULT_DURATION_SECONDS) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      if (session.status !== "running") throw new Error("Игра ещё не запущена");
      const blockers = rows<{ team_id: string }>(await tx`
        select team_id
        from app.team_stage_progress
        where session_id = ${session.id}
          and stage_index = ${session.current_stage_index}
          and status <> 'ready'
        order by team_id
      `);
      if (blockers.length) {
        const error = new Error("Не все команды завершили этап") as Error & { blockers?: string[] };
        error.blockers = blockers.map((item) => item.team_id);
        throw error;
      }

      const nextStage = session.current_stage_index + 1;
      if (nextStage >= scenarioLength) {
        await tx`
          update app.game_sessions
          set status = 'completed', completed_at = now(), stage_opened_at = null, deadline_at = null
          where id = ${session.id}
        `;
        await tx`
          update app.team_stage_progress
          set status = 'completed', version = version + 1
          where session_id = ${session.id} and stage_index = ${session.current_stage_index}
        `;
        await addEvent(tx, session.id, "organizer", "game.completed");
        return;
      }

      await openStage(tx, session.id, nextStage, durationSeconds);
      await addEvent(tx, session.id, "organizer", "stage.opened", undefined, { stageIndex: nextStage, durationSeconds });
    });
  }

  async selectChoice(teamId: string, choiceId: string, source: DecisionSource = "captain") {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      const progress = rows<ProgressRow>(await tx`
        select team_id, status, selected_choice_id, selected_source,
               decision_confirmed_at, file_missing_on_forced_advance, last_activity_at
        from app.team_stage_progress
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
        for update
      `)[0];
      if (!progress || !["awaiting-decision", "decision-selected"].includes(progress.status)) {
        throw new Error("Решение уже зафиксировано или этап закрыт");
      }
      const stage = await validateChoice(tx, session.id, teamId, session.current_stage_index, choiceId);
      await tx`
        update app.team_stage_progress
        set selected_choice_id = ${choiceId}, selected_source = ${source},
            status = 'decision-selected', last_activity_at = now(), version = version + 1
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
      `;
      await addEvent(tx, session.id, source === "captain" ? "captain" : "organizer", "decision.selected", teamId, {
        stageId: stage.id,
        choiceId,
      });
    });
  }

  async confirmChoice(teamId: string) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      const progress = rows<ProgressRow>(await tx`
        select team_id, status, selected_choice_id, selected_source,
               decision_confirmed_at, file_missing_on_forced_advance, last_activity_at
        from app.team_stage_progress
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
        for update
      `)[0];
      if (!progress || progress.status !== "decision-selected" || !progress.selected_choice_id) {
        throw new Error("Сначала выберите решение");
      }
      const stage = await validateChoice(tx, session.id, teamId, session.current_stage_index, progress.selected_choice_id);
      const now = new Date();
      await tx`
        insert into app.decisions (session_id, team_id, stage_index, stage_id, choice_id, source, confirmed_at)
        values (${session.id}, ${teamId}, ${session.current_stage_index}, ${stage.id},
                ${progress.selected_choice_id}, ${progress.selected_source ?? "captain"}, ${now})
        on conflict (session_id, team_id, stage_index, stage_id) do update set
          choice_id = excluded.choice_id,
          source = excluded.source,
          confirmed_at = excluded.confirmed_at
      `;
      await tx`
        update app.team_stage_progress
        set selected_choice_id = null,
            selected_source = null,
            decision_confirmed_at = null,
            status = ${stage.fileRequired ? "awaiting-file" : "awaiting-decision"},
            last_activity_at = ${now},
            version = version + 1
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
      `;
      await addEvent(tx, session.id, "captain", "decision.confirmed", teamId, {
        stageId: stage.id,
        choiceId: progress.selected_choice_id,
      });
    });
  }

  async attachFile(teamId: string, fileName: string, fileUrl: string) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      const progress = rows<ProgressRow>(await tx`
        select team_id, status, selected_choice_id, selected_source,
               decision_confirmed_at, file_missing_on_forced_advance, last_activity_at
        from app.team_stage_progress
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
        for update
      `)[0];
      if (!progress || !["awaiting-file", "ready"].includes(progress.status)) {
        throw new Error("Сейчас файл не ожидается");
      }
      await tx`
        insert into app.file_submissions (session_id, team_id, stage_index, version, original_name, storage_url)
        select ${session.id}, ${teamId}, ${session.current_stage_index}, coalesce(max(version), 0) + 1,
               ${fileName}, ${fileUrl}
        from app.file_submissions
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
      `;
      await tx`
        update app.team_stage_progress
        set status = 'ready', file_missing_on_forced_advance = false,
            last_activity_at = now(), version = version + 1
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
      `;
      await addEvent(tx, session.id, "captain", "file.uploaded", teamId, {
        fileName,
        fileUrl,
        stageIndex: session.current_stage_index,
      });
    });
  }

  async forceResolve(teamId: string, choiceId: string) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      const progress = rows<ProgressRow>(await tx`
        select team_id, status, selected_choice_id, selected_source,
               decision_confirmed_at, file_missing_on_forced_advance, last_activity_at
        from app.team_stage_progress
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
        for update
      `)[0];
      if (!progress || progress.status === "ready" || progress.status === "completed") {
        throw new Error("Команда уже завершила этап");
      }
      const stage = await validateChoice(tx, session.id, teamId, session.current_stage_index, choiceId);
      const now = new Date();
      const fileMissing = stage.fileRequired;
      await tx`
        insert into app.decisions (session_id, team_id, stage_index, stage_id, choice_id, source, confirmed_at)
        values (${session.id}, ${teamId}, ${session.current_stage_index}, ${stage.id},
                ${choiceId}, 'organizer_override', ${now})
        on conflict (session_id, team_id, stage_index, stage_id) do update set
          choice_id = excluded.choice_id,
          source = excluded.source,
          confirmed_at = excluded.confirmed_at
      `;
      await tx`
        update app.team_stage_progress
        set selected_choice_id = null,
            selected_source = null,
            decision_confirmed_at = null,
            status = ${stage.fileRequired ? "ready" : "awaiting-decision"},
            file_missing_on_forced_advance = ${fileMissing},
            last_activity_at = ${now},
            version = version + 1
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
      `;
      await addEvent(tx, session.id, "organizer", "decision.forced", teamId, {
        stageId: stage.id,
        choiceId,
        fileMissing,
      });
    });
  }

  async forceCompleteWithoutFile(teamId: string) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      const progress = rows<ProgressRow>(await tx`
        select team_id, status, selected_choice_id, selected_source,
               decision_confirmed_at, file_missing_on_forced_advance, last_activity_at
        from app.team_stage_progress
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
        for update
      `)[0];
      if (!progress || progress.status !== "awaiting-file") {
        throw new Error("Команда сейчас не ожидает файл");
      }
      await tx`
        update app.team_stage_progress
        set status = 'ready', file_missing_on_forced_advance = true,
            last_activity_at = now(), version = version + 1
        where session_id = ${session.id} and team_id = ${teamId}
          and stage_index = ${session.current_stage_index}
      `;
      await addEvent(tx, session.id, "organizer", "stage.forced_without_file", teamId, {
        stageIndex: session.current_stage_index,
      });
    });
  }

  async bindCaptain(teamId: string, telegramUserId: string, chatId: string) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx, true);
      const team = rows<{ captain_telegram_user_id: string | null }>(await tx`
        select captain_telegram_user_id::text
        from app.teams
        where id = ${teamId}
        for update
      `)[0];
      if (!team) throw new Error("Команда не найдена");
      if (team.captain_telegram_user_id && team.captain_telegram_user_id !== telegramUserId) {
        throw new Error("Бот уже привязан к другому капитану");
      }
      const conflict = rows<{ id: string }>(await tx`
        select id
        from app.teams
        where id <> ${teamId}
          and (captain_telegram_user_id = ${telegramUserId} or captain_chat_id = ${chatId})
        limit 1
      `)[0];
      if (conflict) throw new Error("Капитан уже привязан к другой команде");
      await tx`
        update app.teams
        set captain_telegram_user_id = ${telegramUserId}, captain_chat_id = ${chatId}, captain_bound_at = now()
        where id = ${teamId}
      `;
      await addEvent(tx, session.id, "captain", "captain.bound", teamId);
    });
  }

  async markUpdateProcessed(botKey: string, updateId: number) {
    const inserted = await this.sql`
      insert into app.processed_telegram_updates (bot_key, update_id)
      values (${botKey}, ${updateId})
      on conflict do nothing
      returning update_id
    `;
    return inserted.length === 1;
  }

  async setDelivery(teamId: string, status: "sent" | "failed", error?: string) {
    await this.sql.begin(async (tx) => {
      const session = await currentSession(tx);
      await tx`
        insert into app.delivery_attempts (session_id, team_id, stage_index, message_kind, status, error_code)
        values (${session.id}, ${teamId}, ${session.current_stage_index}, 'stage', ${status}, ${error?.slice(0, 500) ?? null})
      `;
    });
  }
}

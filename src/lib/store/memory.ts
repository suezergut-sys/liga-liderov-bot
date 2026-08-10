import { randomUUID } from "node:crypto";
import { botConfigs, isDemoMode } from "@/lib/config";
import type {
  AuditEvent,
  DecisionSource,
  GameSnapshot,
  GameState,
  TeamState,
} from "@/lib/domain/types";
import { getScenarioStage, scenarioLength } from "@/lib/scenario";

const DEFAULT_DURATION_SECONDS = 10 * 60;

interface MemoryData {
  game: GameState;
  teams: TeamState[];
  audit: AuditEvent[];
  processedUpdates: Set<string>;
}

function initialData(): MemoryData {
  return {
    game: {
      status: "waiting",
      currentStageIndex: -1,
      durationSeconds: DEFAULT_DURATION_SECONDS,
    },
    teams: botConfigs.map((bot) => ({
      id: bot.teamId,
      number: bot.teamNumber,
      name: bot.teamName,
      color: bot.color,
      botKey: bot.key,
      status: "waiting",
      currentStageIndex: -1,
      delivery: { status: "not-sent" },
      history: [],
    })),
    audit: [],
    processedUpdates: new Set(),
  };
}

function addEvent(
  data: MemoryData,
  actor: AuditEvent["actor"],
  action: string,
  teamId?: string,
  details?: Record<string, unknown>,
) {
  data.audit.unshift({ id: randomUUID(), at: new Date().toISOString(), actor, action, teamId, details });
  data.audit = data.audit.slice(0, 100);
}

export class MemoryGameStore {
  constructor(private data: MemoryData = initialData()) {}

  reset() {
    this.data = initialData();
    addEvent(this.data, "organizer", "game.reset");
  }

  snapshot(): GameSnapshot {
    return structuredClone({
      game: this.data.game,
      teams: this.data.teams,
      audit: this.data.audit,
      serverNow: new Date().toISOString(),
      demoMode: isDemoMode,
    });
  }

  getTeam(teamId: string) {
    const team = this.data.teams.find((item) => item.id === teamId);
    if (!team) throw new Error("Команда не найдена");
    return team;
  }

  getTeamByBotKey(botKey: string) {
    const team = this.data.teams.find((item) => item.botKey === botKey);
    if (!team) throw new Error("Бот не привязан к команде");
    return team;
  }

  getStage(teamId: string) {
    const team = this.getTeam(teamId);
    if (team.currentStageIndex < 0) return undefined;
    return getScenarioStage(team, team.currentStageIndex);
  }

  startGame() {
    if (this.data.game.status !== "waiting") throw new Error("Игра уже запущена");
    this.openStage(0);
    addEvent(this.data, "organizer", "stage.opened", undefined, { stageIndex: 0 });
  }

  advanceGame() {
    if (this.data.game.status !== "running") throw new Error("Игра ещё не запущена");
    const blockers = this.data.teams.filter((team) => team.status !== "ready");
    if (blockers.length) {
      const error = new Error("Не все команды завершили этап") as Error & { blockers?: string[] };
      error.blockers = blockers.map((team) => team.id);
      throw error;
    }

    const nextStage = this.data.game.currentStageIndex + 1;
    if (nextStage >= scenarioLength) {
      this.data.game = { ...this.data.game, status: "completed", stageOpenedAt: undefined, deadlineAt: undefined };
      for (const team of this.data.teams) team.status = "completed";
      addEvent(this.data, "organizer", "game.completed");
      return;
    }

    this.openStage(nextStage);
    addEvent(this.data, "organizer", "stage.opened", undefined, { stageIndex: nextStage });
  }

  private openStage(stageIndex: number) {
    const openedAt = new Date();
    this.data.game = {
      status: "running",
      currentStageIndex: stageIndex,
      stageOpenedAt: openedAt.toISOString(),
      deadlineAt: new Date(openedAt.getTime() + DEFAULT_DURATION_SECONDS * 1000).toISOString(),
      durationSeconds: DEFAULT_DURATION_SECONDS,
    };
    for (const team of this.data.teams) {
      team.currentStageIndex = stageIndex;
      team.status = "awaiting-decision";
      team.selectedChoiceId = undefined;
      team.selectedSource = undefined;
      team.decisionConfirmedAt = undefined;
      team.currentFileName = undefined;
      team.currentFileUrl = undefined;
      team.delivery = { status: "not-sent" };
      team.lastActivityAt = openedAt.toISOString();
    }
  }

  selectChoice(teamId: string, choiceId: string, source: DecisionSource = "captain") {
    const team = this.getTeam(teamId);
    if (!['awaiting-decision', 'decision-selected'].includes(team.status)) {
      throw new Error("Решение уже зафиксировано или этап закрыт");
    }
    const stage = getScenarioStage(team, team.currentStageIndex);
    if (!stage.choices.some((choice) => choice.id === choiceId)) throw new Error("Недопустимый вариант");
    team.selectedChoiceId = choiceId;
    team.selectedSource = source;
    team.status = "decision-selected";
    team.lastActivityAt = new Date().toISOString();
    addEvent(this.data, source === "captain" ? "captain" : "organizer", "decision.selected", teamId, { choiceId });
  }

  confirmChoice(teamId: string) {
    const team = this.getTeam(teamId);
    if (team.status !== "decision-selected" || !team.selectedChoiceId) throw new Error("Сначала выберите решение");
    const stage = getScenarioStage(team, team.currentStageIndex);
    const now = new Date().toISOString();
    team.decisionConfirmedAt = now;
    team.status = stage.fileRequired ? "awaiting-file" : "ready";
    team.lastActivityAt = now;
    if (!stage.fileRequired) this.commitDecision(team, false);
    addEvent(this.data, "captain", "decision.confirmed", teamId, { choiceId: team.selectedChoiceId });
  }

  attachFile(teamId: string, fileName: string, fileUrl: string) {
    const team = this.getTeam(teamId);
    if (team.status !== "awaiting-file" && team.status !== "ready") throw new Error("Сейчас файл не ожидается");
    team.currentFileName = fileName;
    team.currentFileUrl = fileUrl;
    team.status = "ready";
    team.lastActivityAt = new Date().toISOString();
    this.commitDecision(team, false);
    addEvent(this.data, "captain", "file.uploaded", teamId, { fileName });
  }

  forceResolve(teamId: string, choiceId: string) {
    const team = this.getTeam(teamId);
    if (team.status === "ready" || team.status === "completed") throw new Error("Команда уже завершила этап");
    const stage = getScenarioStage(team, team.currentStageIndex);
    if (!stage.choices.some((choice) => choice.id === choiceId)) throw new Error("Недопустимый вариант");
    const now = new Date().toISOString();
    team.selectedChoiceId = choiceId;
    team.selectedSource = "organizer_override";
    team.decisionConfirmedAt = now;
    team.status = "ready";
    team.lastActivityAt = now;
    this.commitDecision(team, stage.fileRequired && !team.currentFileName);
    addEvent(this.data, "organizer", "decision.forced", teamId, {
      choiceId,
      fileMissing: stage.fileRequired && !team.currentFileName,
    });
  }

  private commitDecision(team: TeamState, fileMissingOnForcedAdvance: boolean) {
    if (!team.selectedChoiceId || !team.decisionConfirmedAt) return;
    const stage = getScenarioStage(team, team.currentStageIndex);
    const existing = team.history.find((item) => item.stageIndex === team.currentStageIndex);
    const record = {
      stageIndex: team.currentStageIndex,
      stageId: stage.id,
      choiceId: team.selectedChoiceId,
      source: team.selectedSource ?? "captain",
      confirmedAt: team.decisionConfirmedAt,
      fileName: team.currentFileName,
      fileUrl: team.currentFileUrl,
      fileMissingOnForcedAdvance,
    };
    if (existing) Object.assign(existing, record);
    else team.history.push(record);
  }

  bindCaptain(teamId: string, telegramUserId: string, chatId: string) {
    const team = this.getTeam(teamId);
    if (team.captainTelegramUserId && team.captainTelegramUserId !== telegramUserId) {
      throw new Error("Бот уже привязан к другому капитану");
    }
    team.captainTelegramUserId = telegramUserId;
    team.captainChatId = chatId;
    team.lastActivityAt = new Date().toISOString();
    addEvent(this.data, "captain", "captain.bound", teamId);
  }

  markUpdateProcessed(botKey: string, updateId: number) {
    const key = `${botKey}:${updateId}`;
    if (this.data.processedUpdates.has(key)) return false;
    this.data.processedUpdates.add(key);
    return true;
  }

  setDelivery(teamId: string, status: "sent" | "failed", error?: string) {
    const team = this.getTeam(teamId);
    team.delivery = { status, at: new Date().toISOString(), error };
  }
}

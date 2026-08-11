import { describe, expect, it } from "vitest";
import { MemoryGameStore } from "@/lib/store/memory";

function firstChoice(store: MemoryGameStore, teamId: string) {
  return store.getStage(teamId)!.choices[0].id;
}

function forceCurrentStage(store: MemoryGameStore, teamId: string) {
  for (let remainingSteps = 10; remainingSteps > 0; remainingSteps -= 1) {
    const team = store.getTeam(teamId);
    if (team.status === "ready") return;
    if (team.status === "awaiting-file") {
      store.forceCompleteWithoutFile(teamId);
      return;
    }
    const stage = store.getStage(teamId);
    if (!stage?.choices.length) throw new Error(`Нет доступного решения для ${teamId}`);
    store.forceResolve(teamId, stage.choices[0].id);
  }
  throw new Error(`Слишком много шагов для ${teamId}`);
}

describe("MemoryGameStore", () => {
  it("blocks advance until every team is ready", () => {
    const store = new MemoryGameStore();
    store.startGame();
    expect(() => store.advanceGame()).toThrow("Не все команды завершили этап");
  });

  it("uses the organizer duration for each newly opened stage", () => {
    const store = new MemoryGameStore();
    store.startGame(3 * 60);
    expect(store.snapshot().game.durationSeconds).toBe(3 * 60);

    for (let number = 1; number <= 7; number += 1) {
      const teamId = `team-${number}`;
      forceCurrentStage(store, teamId);
    }
    store.advanceGame(7 * 60);

    const game = store.snapshot().game;
    expect(game.durationSeconds).toBe(7 * 60);
    expect(new Date(game.deadlineAt!).getTime() - new Date(game.stageOpenedAt!).getTime()).toBe(7 * 60 * 1000);
  });

  it("rejects a duration outside the supported range", () => {
    const store = new MemoryGameStore();
    expect(() => store.startGame(59)).toThrow("Длительность этапа должна быть от 1 до 1440 минут");
  });

  it("locks a captain decision after confirmation", () => {
    const store = new MemoryGameStore();
    store.startGame();
    store.selectChoice("team-1", "urgent-hire");
    store.confirmChoice("team-1");
    expect(() => store.selectChoice("team-1", "use-contractors")).toThrow("Решение уже зафиксировано");
    expect(store.getTeam("team-1").history).toHaveLength(1);
  });

  it("records an intermediate choice and opens the next step before requesting Excel", () => {
    const store = new MemoryGameStore();
    store.startGame();
    for (let number = 1; number <= 7; number += 1) forceCurrentStage(store, `team-${number}`);
    store.advanceGame();

    store.selectChoice("team-1", "hire-two-consultants");
    store.confirmChoice("team-1");
    expect(store.getTeam("team-1")).toMatchObject({ status: "awaiting-decision" });
    expect(store.getStage("team-1")?.id).toBe("red-q2-yakor-start");
    expect(store.getTeam("team-1").history.filter((item) => item.stageIndex === 1)).toHaveLength(1);

    store.selectChoice("team-1", "start-yakor-now");
    store.confirmChoice("team-1");
    expect(store.getTeam("team-1")).toMatchObject({ status: "awaiting-file" });
    expect(store.getTeam("team-1").history.filter((item) => item.stageIndex === 1)).toHaveLength(2);
  });

  it("records an organizer override and missing file", () => {
    const store = new MemoryGameStore();
    store.startGame();
    store.forceResolve("team-1", "use-contractors");
    const team = store.getTeam("team-1");
    expect(team.status).toBe("ready");
    expect(team.history[0]).toMatchObject({
      choiceId: "use-contractors",
      source: "organizer_override",
      fileMissingOnForcedAdvance: true,
    });
  });

  it("opens color- and branch-specific second stages", () => {
    const store = new MemoryGameStore();
    store.startGame();
    for (let number = 1; number <= 7; number += 1) {
      const teamId = `team-${number}`;
      const choiceId = number === 1 ? "urgent-hire" : firstChoice(store, teamId);
      store.forceResolve(teamId, choiceId);
    }
    store.advanceGame();
    expect(store.getStage("team-1")?.id).toBe("red-q2-staffing");
    expect(store.getStage("team-5")?.situation).toContain("Проект «Шахты» продолжается");
  });

  it("runs all four final-scenario stages to completion", () => {
    const store = new MemoryGameStore();
    store.startGame();

    for (let stageIndex = 0; stageIndex < 4; stageIndex += 1) {
      for (let number = 1; number <= 7; number += 1) {
        const teamId = `team-${number}`;
        forceCurrentStage(store, teamId);
      }
      store.advanceGame();
    }

    expect(store.snapshot().game.status).toBe("completed");
    expect(store.getTeam("team-1").history).toHaveLength(5);
    expect(store.getTeam("team-5").history).toHaveLength(5);
  });

  it("deduplicates Telegram updates per bot", () => {
    const store = new MemoryGameStore();
    expect(store.markUpdateProcessed("team-1", 42)).toBe(true);
    expect(store.markUpdateProcessed("team-1", 42)).toBe(false);
    expect(store.markUpdateProcessed("team-2", 42)).toBe(true);
  });
});

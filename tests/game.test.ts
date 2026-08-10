import { describe, expect, it } from "vitest";
import { MemoryGameStore } from "@/lib/store/memory";

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
      store.forceResolve(`team-${number}`, "protect-margin");
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
    store.selectChoice("team-1", "accept-discount");
    store.confirmChoice("team-1");
    expect(() => store.selectChoice("team-1", "protect-margin")).toThrow("Решение уже зафиксировано");
  });

  it("records an organizer override and missing file", () => {
    const store = new MemoryGameStore();
    store.startGame();
    store.forceResolve("team-1", "protect-margin");
    const team = store.getTeam("team-1");
    expect(team.status).toBe("ready");
    expect(team.history[0]).toMatchObject({
      choiceId: "protect-margin",
      source: "organizer_override",
      fileMissingOnForcedAdvance: true,
    });
  });

  it("opens the branch-specific second stage", () => {
    const store = new MemoryGameStore();
    store.startGame();
    for (let number = 1; number <= 7; number += 1) {
      store.forceResolve(`team-${number}`, number === 1 ? "accept-discount" : "protect-margin");
    }
    store.advanceGame();
    expect(store.getStage("team-1")?.situation).toContain("маржинальность снизилась");
    expect(store.getStage("team-2")?.situation).toContain("Переговоры затянулись");
  });

  it("deduplicates Telegram updates per bot", () => {
    const store = new MemoryGameStore();
    expect(store.markUpdateProcessed("team-1", 42)).toBe(true);
    expect(store.markUpdateProcessed("team-1", 42)).toBe(false);
    expect(store.markUpdateProcessed("team-2", 42)).toBe(true);
  });
});

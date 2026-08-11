import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresGameStore } from "@/lib/store/postgres";

const runIntegration = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);

describe.skipIf(!runIntegration)("PostgresGameStore integration", () => {
  let store: PostgresGameStore;

  beforeAll(async () => {
    store = new PostgresGameStore();
    await store.reset();
  });

  afterAll(async () => {
    await store.reset();
  });

  it("persists a complete stage and exposes it from a new store instance", { timeout: 30_000 }, async () => {
    await store.startGame();
    await store.selectChoice("team-1", "urgent-hire");
    await store.confirmChoice("team-1");
    await store.attachFile("team-1", "budget-team-1.xlsx", "integration-file");

    for (let number = 2; number <= 7; number += 1) {
      const teamId = `team-${number}`;
      const choiceId = (await store.getStage(teamId))!.choices[0].id;
      await store.forceResolve(teamId, choiceId);
    }

    const persisted = await new PostgresGameStore().snapshot();
    expect(persisted.game).toMatchObject({ status: "running", currentStageIndex: 0 });
    expect(persisted.teams[0]).toMatchObject({
      status: "ready",
      selectedChoiceId: "urgent-hire",
      currentFileName: "budget-team-1.xlsx",
    });
    expect(persisted.teams[0].history[0]).toMatchObject({
      choiceId: "urgent-hire",
      source: "captain",
    });

    await store.advanceGame();
    expect((await store.getStage("team-1"))?.situation).toContain("наняли двух старших консультантов");
  });

  it("deduplicates concurrent Telegram updates in PostgreSQL", async () => {
    const botKey = `integration-${Date.now()}`;
    const results = await Promise.all([
      store.markUpdateProcessed(botKey, 42),
      store.markUpdateProcessed(botKey, 42),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as adminAction } from "@/app/api/admin/action/route";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { POST as telegramWebhook } from "@/app/api/telegram/[botKey]/route";
import { gameStore } from "@/lib/store";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("HTTP API integration", () => {
  beforeEach(async () => {
    delete process.env.ADMIN_PASSWORD;
    await gameStore.reset();
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it("starts the game and exposes the same state on the dashboard", async () => {
    const actionResponse = await adminAction(
      jsonRequest("http://localhost/api/admin/action", { type: "start", durationSeconds: 180 }),
    );
    expect(actionResponse.status).toBe(200);
    expect((await actionResponse.json()).game).toMatchObject({
      status: "running",
      currentStageIndex: 0,
      durationSeconds: 180,
    });

    const dashboardResponse = await dashboard(new NextRequest("http://localhost/api/dashboard"));
    expect(dashboardResponse.status).toBe(200);
    const snapshot = await dashboardResponse.json();
    expect(snapshot.teams).toHaveLength(7);
    expect(snapshot.teams[0]).toMatchObject({ status: "awaiting-decision", currentStageIndex: 0 });
  });

  it("records a delivery failure when a connected team has no bot token", async () => {
    await gameStore.bindCaptain("team-1", "telegram-user", "telegram-chat");

    const response = await adminAction(jsonRequest("http://localhost/api/admin/action", { type: "start" }));
    expect(response.status).toBe(200);
    const snapshot = await response.json();

    expect(snapshot.teams[0].delivery).toMatchObject({
      status: "failed",
      error: "Не настроен Telegram-токен team-1",
    });
  });

  it("accepts a legacy combined Q2 organizer choice as separate audited steps", async () => {
    await gameStore.startGame();
    for (let number = 1; number <= 7; number += 1) {
      await gameStore.forceResolve(`team-${number}`, number <= 4 ? "urgent-hire" : "discount-start");
    }
    await gameStore.advanceGame();

    const response = await adminAction(jsonRequest("http://localhost/api/admin/action", {
      type: "force",
      teamId: "team-2",
      choiceId: "gamma-contractors-q3",
    }));
    expect(response.status).toBe(200);
    const snapshot = await response.json();
    const team = snapshot.teams.find((item: { id: string }) => item.id === "team-2");
    expect(team.status).toBe("ready");
    expect(team.history.filter((item: { stageIndex: number }) => item.stageIndex === 1)).toMatchObject([
      { stageId: "red-q2-staffing", choiceId: "use-gamma-contractors", source: "organizer_override" },
      { stageId: "red-q2-yakor-start", choiceId: "start-yakor-q3", source: "organizer_override" },
    ]);
  });

  it("accepts the legacy red Q3 yes-or-no choice from an already open admin page", async () => {
    await gameStore.startGame();
    for (let number = 1; number <= 7; number += 1) {
      await gameStore.forceResolve(`team-${number}`, number <= 4 ? "urgent-hire" : "discount-start");
    }
    await gameStore.advanceGame();

    for (let number = 1; number <= 4; number += 1) {
      await gameStore.forceResolve(`team-${number}`, "use-gamma-contractors");
      await gameStore.forceResolve(`team-${number}`, "start-yakor-q3");
    }
    for (let number = 5; number <= 7; number += 1) {
      await gameStore.forceResolve(`team-${number}`, "do-not-hire-consultants");
      await gameStore.forceResolve(`team-${number}`, "skip-pr");
      await gameStore.forceResolve(`team-${number}`, "decline-bonus-advance");
    }
    await gameStore.advanceGame();

    const response = await adminAction(jsonRequest("http://localhost/api/admin/action", {
      type: "force",
      teamId: "team-2",
      choiceId: "keep-profit-target",
    }));

    expect(response.status).toBe(200);
    const snapshot = await response.json();
    const team = snapshot.teams.find((item: { id: string }) => item.id === "team-2");
    expect(team).toMatchObject({ status: "ready" });
    expect(team.history.filter((item: { stageIndex: number }) => item.stageIndex === 2)).toMatchObject([
      { stageId: "red-q3-profit-target", choiceId: "change-forecast", source: "organizer_override" },
    ]);
  });

  it("rejects malformed and unauthenticated admin commands", async () => {
    const malformed = await adminAction(jsonRequest("http://localhost/api/admin/action", { type: "unknown" }));
    expect(malformed.status).toBe(400);
    const invalidDuration = await adminAction(
      jsonRequest("http://localhost/api/admin/action", { type: "start", durationSeconds: 59 }),
    );
    expect(invalidDuration.status).toBe(400);

    process.env.ADMIN_PASSWORD = "configured";
    const unauthenticated = await adminAction(jsonRequest("http://localhost/api/admin/action", { type: "start" }));
    expect(unauthenticated.status).toBe(401);
  });

  it("rejects unknown bots and webhooks without the configured secret", async () => {
    const update = { update_id: 1 };
    const unknown = await telegramWebhook(
      jsonRequest("http://localhost/api/telegram/unknown", update),
      { params: Promise.resolve({ botKey: "unknown" }) },
    );
    expect(unknown.status).toBe(404);

    const unauthorized = await telegramWebhook(
      jsonRequest("http://localhost/api/telegram/team-1", update),
      { params: Promise.resolve({ botKey: "team-1" }) },
    );
    expect(unauthorized.status).toBe(401);
  });
});

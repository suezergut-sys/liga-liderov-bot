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

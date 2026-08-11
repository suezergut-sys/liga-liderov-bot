import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as telegramWebhook } from "@/app/api/telegram/[botKey]/route";
import { getBotConfig } from "@/lib/config";
import { gameStore } from "@/lib/store";

const bot = getBotConfig("team-1")!;
const originalToken = bot.token;
const originalWebhookSecret = bot.webhookSecret;

describe("Telegram callback handling", () => {
  beforeEach(async () => {
    bot.token = "test-token";
    bot.webhookSecret = "test-webhook-secret";
    await gameStore.reset();
    await gameStore.bindCaptain("team-1", "101", "202");
    await gameStore.startGame();
  });

  afterEach(() => {
    bot.token = originalToken;
    bot.webhookSecret = originalWebhookSecret;
    vi.unstubAllGlobals();
  });

  it("keeps a valid choice when Telegram says the callback query is too old", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/answerCallbackQuery")) {
        return new Response(JSON.stringify({
          ok: false,
          description: "Bad Request: query is too old and response timeout expired or query ID is invalid",
        }), { status: 400, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/sendMessage")) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected Telegram request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/telegram/team-1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "test-webhook-secret",
      },
      body: JSON.stringify({
        update_id: 9001,
        callback_query: {
          id: "expired-query",
          data: "pick:0:red-q1-yakor-modernization:urgent-hire",
          from: { id: 101 },
          message: { chat: { id: 202 } },
        },
      }),
    });

    const response = await telegramWebhook(request, { params: Promise.resolve({ botKey: "team-1" }) });
    const team = await gameStore.getTeam("team-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(team).toMatchObject({ status: "decision-selected", selectedChoiceId: "urgent-hire" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/answerCallbackQuery");
    expect(fetchMock.mock.calls[1][0]).toContain("/sendMessage");
  });
});

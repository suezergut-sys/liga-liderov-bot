import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotConfig } from "@/lib/config";
import type { DecisionRecord, TeamState } from "@/lib/domain/types";
import { sendCurrentStage } from "@/lib/telegram";

const bot: BotConfig = {
  key: "team-5",
  teamId: "team-5",
  teamNumber: 5,
  teamName: "Команда 5",
  color: "blue",
  token: "test-token",
};

function team(
  history: DecisionRecord[] = [],
  stageIndex = 0,
  color: TeamState["color"] = "blue",
): TeamState {
  return {
    id: color === "red" ? "team-1" : "team-5",
    number: color === "red" ? 1 : 5,
    name: color === "red" ? "Команда 1" : "Команда 5",
    color,
    botKey: color === "red" ? "team-1" : "team-5",
    captainChatId: "chat-5",
    status: "awaiting-decision",
    currentStageIndex: stageIndex,
    delivery: { status: "not-sent" },
    history,
  };
}

function record(stageIndex: number, stageId: string, choiceId: string): DecisionRecord {
  return {
    stageIndex,
    stageId,
    choiceId,
    source: "captain",
    confirmedAt: "2026-08-11T00:00:00.000Z",
  };
}

function telegramFetch() {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Telegram scenario messages", () => {
  it("binds callback buttons to both the global stage and the current step", async () => {
    const calls = telegramFetch();
    await sendCurrentStage(bot, team([
      record(0, "blue-q1-shahta-discount", "hold-rate"),
      record(1, "blue-q2-vyshka-hiring", "hire-consultants"),
    ], 1));

    const markup = calls[0].body.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    expect(markup.inline_keyboard[0][0].callback_data).toBe("pick:1:blue-q2-vyshka-pr:run-pr");
    expect(markup.inline_keyboard[0][0].text).toBe("Да");
  });

  it("moves long choice labels into the message and keeps mobile buttons short", async () => {
    const calls = telegramFetch();
    await sendCurrentStage(bot, team([], 0, "red"));

    const markup = calls[0].body.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    expect(markup.inline_keyboard.map((row) => row[0].text)).toEqual(["Вариант 1", "Вариант 2"]);
    expect(calls[0].body.text).toContain("<b>Вариант 1.</b> Срочно нанять 2 старших консультантов");
    expect(calls[0].body.text).toContain("<b>Вариант 2.</b> Выполнить проект подрядчиками");
  });

  it("sends the informational blue final consequence directly with the Excel request", async () => {
    const calls = telegramFetch();
    const finalTeam = team([
      record(1, "blue-q2-vyshka-hiring", "hire-consultants"),
      record(1, "blue-q2-vyshka-pr", "run-pr"),
      record(1, "blue-q2-seller-bonus", "decline-bonus-advance"),
      record(2, "blue-q3-vyshka-crisis", "stop-project"),
    ], 3);
    finalTeam.status = "awaiting-file";

    await sendCurrentStage(bot, finalTeam);

    expect(calls[0].body.text).toContain("может добавить 7 млн рублей");
    expect(calls[0].body.text).toContain("Отправьте актуальный Excel-файл");
    expect(calls[0].body.reply_markup).toBeUndefined();
  });
});

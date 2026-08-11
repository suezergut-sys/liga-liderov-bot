import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getBotConfig } from "@/lib/config";
import { getScenarioStage } from "@/lib/scenario";
import { gameStore } from "@/lib/store";
import {
  answerCallback,
  persistTelegramDocument,
  sendCurrentStage,
  sendText,
} from "@/lib/telegram";

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    from?: { id: number };
    chat: { id: number };
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { chat: { id: number } };
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await context.params;
  const bot = getBotConfig(botKey);
  if (!bot) return NextResponse.json({ error: "Unknown bot" }, { status: 404 });

  const webhookSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!bot.webhookSecret || webhookSecret !== bot.webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  if (!Number.isInteger(update.update_id)) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  if (!(await gameStore.markUpdateProcessed(botKey, update.update_id))) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const team = await gameStore.getTeamByBotKey(botKey);
    if (update.message?.text?.startsWith("/start")) {
      const activationToken = update.message.text.split(/\s+/)[1];
      if (!bot.activationToken || activationToken !== bot.activationToken) {
        await sendText(bot, String(update.message.chat.id), "Ссылка активации недействительна. Обратитесь к организатору.");
        return NextResponse.json({ ok: true });
      }
      await gameStore.bindCaptain(team.id, String(update.message.from?.id), String(update.message.chat.id));
      await sendText(bot, String(update.message.chat.id), `<b>${team.name}</b> подключена. Ожидайте начала игры.`);
      if ((await gameStore.snapshot()).game.status === "running") await sendCurrentStage(bot, await gameStore.getTeam(team.id));
      return NextResponse.json({ ok: true });
    }

    const senderId = update.message?.from?.id ?? update.callback_query?.from.id;
    if (!team.captainTelegramUserId || String(senderId) !== team.captainTelegramUserId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (update.callback_query?.data) {
      await answerCallback(bot, update.callback_query.id);
      const [action, stageRaw, stepId, choiceId] = update.callback_query.data.split(":");
      const stageIndex = Number(stageRaw);
      if (stageIndex !== team.currentStageIndex) throw new Error("Эта карточка уже неактуальна");
      const stage = getScenarioStage(team, stageIndex);
      if (!stage || stage.id !== stepId) throw new Error("Этот шаг уже завершён");
      const choice = stage.choices.find((item) => item.id === choiceId);
      if (!choice) throw new Error("Недопустимый вариант");
      if (action === "pick") {
        await gameStore.selectChoice(team.id, choiceId);
        await sendText(
          bot,
          team.captainChatId!,
          `Вы выбрали: <b>${choice.label}</b>\n\nПодтвердить решение? После подтверждения изменить его нельзя.`,
          { inline_keyboard: [[{ text: "Подтвердить", callback_data: `confirm:${stageIndex}:${stage.id}:${choiceId}` }]] },
        );
      } else if (action === "confirm") {
        if (team.selectedChoiceId !== choiceId) throw new Error("Сначала заново выберите решение");
        await gameStore.confirmChoice(team.id);
        const updatedTeam = await gameStore.getTeam(team.id);
        const result = choice.result ? `\n\n${choice.result}` : "";
        if (updatedTeam.status === "awaiting-decision") {
          await sendText(bot, team.captainChatId!, `Решение зафиксировано.${result}`);
          await sendCurrentStage(bot, updatedTeam);
        } else {
          await sendText(
            bot,
            team.captainChatId!,
            `Решение зафиксировано.${result}\n\nОтправьте актуальный Excel-файл бюджета в формате .xlsx.`,
          );
        }
      }
    } else if (update.message?.document) {
      const stored = await persistTelegramDocument(bot, team.id, update.message.document);
      await gameStore.attachFile(team.id, stored.fileName, stored.fileUrl);
      await sendText(bot, team.captainChatId!, "Файл сохранён. Этап завершён — ожидайте команды организатора.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) await sendText(bot, String(chatId), `Не удалось выполнить действие: ${error instanceof Error ? error.message : "неизвестная ошибка"}`).catch(() => undefined);
    return NextResponse.json({ ok: true, handledError: true });
  }
}

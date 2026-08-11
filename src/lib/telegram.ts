import { put } from "@vercel/blob";
import type { BotConfig } from "@/lib/config";
import type { TeamState } from "@/lib/domain/types";
import { getScenarioStage } from "@/lib/scenario";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

async function telegramCall<T>(bot: BotConfig, method: string, body: Record<string, unknown>): Promise<T> {
  if (!bot.token) throw new Error(`Не настроен токен ${bot.key}`);
  const response = await fetch(`${TELEGRAM_API}/bot${bot.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { ok: boolean; result: T; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram ${method} failed`);
  return result.result;
}

export async function sendText(bot: BotConfig, chatId: string, text: string, replyMarkup?: unknown) {
  return telegramCall(bot, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

function hasLongChoiceLabels(labels: string[]) {
  return labels.some((label) => label.trim().split(/\s+/).length > 2);
}

export async function sendCurrentStage(bot: BotConfig, team: TeamState) {
  if (!team.captainChatId || team.currentStageIndex < 0) return;
  const stage = getScenarioStage(team, team.currentStageIndex);
  if (!stage) {
    if (team.status === "awaiting-file") {
      await sendText(bot, team.captainChatId, "Отправьте актуальный Excel-файл бюджета в формате .xlsx.");
    }
    return;
  }
  if (stage.choices.length === 0) {
    await sendText(
      bot,
      team.captainChatId,
      `<b>${stage.title}</b>\n\n${stage.situation}\n\nОтправьте актуальный Excel-файл бюджета в формате .xlsx.`,
    );
    return;
  }
  const useNumberedChoices = hasLongChoiceLabels(stage.choices.map((choice) => choice.label));
  const buttons = stage.choices.map((choice, index) => [
    {
      text: useNumberedChoices ? `Вариант ${index + 1}` : choice.label,
      callback_data: `pick:${team.currentStageIndex}:${stage.id}:${choice.id}`,
    },
  ]);
  const choiceList = useNumberedChoices
    ? `\n\n${stage.choices.map((choice, index) => `<b>Вариант ${index + 1}.</b> ${choice.label}`).join("\n\n")}`
    : "";
  await sendText(
    bot,
    team.captainChatId,
    `<b>${stage.title}</b>\n\n${stage.situation}${choiceList}\n\nВыберите решение команды:`,
    { inline_keyboard: buttons },
  );
}

export async function answerCallback(bot: BotConfig, callbackQueryId: string, text?: string) {
  try {
    return await telegramCall(bot, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/query is too old|query ID is invalid/i.test(message)) return undefined;
    throw error;
  }
}

interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export async function downloadTelegramDocument(bot: BotConfig, fileId: string) {
  const file = await telegramCall<{ file_path?: string }>(bot, "getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram не вернул путь к файлу");
  const response = await fetch(`${TELEGRAM_API}/file/bot${bot.token}/${file.file_path}`);
  if (!response.ok) throw new Error("Не удалось скачать файл из Telegram");
  return response;
}

export async function persistTelegramDocument(bot: BotConfig, teamId: string, document: TelegramDocument) {
  const fileName = document.file_name ?? "budget.xlsx";
  if (!fileName.toLowerCase().endsWith(".xlsx")) throw new Error("Нужен файл в формате .xlsx");
  if (document.file_size && document.file_size > MAX_FILE_SIZE) throw new Error("Файл превышает лимит 20 МБ");

  if (!bot.token || !process.env.BLOB_READ_WRITE_TOKEN) {
    return { fileName, fileUrl: `telegram-file:${document.file_id}` };
  }

  const response = await downloadTelegramDocument(bot, document.file_id);
  const blob = await put(`submissions/${teamId}/${Date.now()}-${fileName}`, response.body!, {
    access: "private",
    contentType: document.mime_type ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { fileName, fileUrl: blob.url };
}

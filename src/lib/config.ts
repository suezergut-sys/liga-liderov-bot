import type { TeamColor } from "@/lib/domain/types";

export interface BotConfig {
  key: string;
  teamId: string;
  teamNumber: number;
  teamName: string;
  color: TeamColor;
  token?: string;
  webhookSecret?: string;
  activationToken?: string;
}

export const botConfigs: BotConfig[] = Array.from({ length: 7 }, (_, index) => {
  const number = index + 1;
  return {
    key: `team-${number}`,
    teamId: `team-${number}`,
    teamNumber: number,
    teamName: `Команда ${number}`,
    color: number <= 4 ? "red" : "blue",
    token: process.env[`TELEGRAM_BOT_${number}_TOKEN`],
    webhookSecret: process.env[`TELEGRAM_BOT_${number}_WEBHOOK_SECRET`],
    activationToken: process.env[`TELEGRAM_BOT_${number}_ACTIVATION_TOKEN`],
  };
});

export function getBotConfig(botKey: string): BotConfig | undefined {
  return botConfigs.find((bot) => bot.key === botKey);
}

export const isDemoMode = !botConfigs.some((bot) => bot.token);

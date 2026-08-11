import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { getBotConfig } from "@/lib/config";
import { expandLegacyChoiceId, getScenarioStage } from "@/lib/scenario";
import { gameStore } from "@/lib/store";
import { sendCurrentStage } from "@/lib/telegram";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), durationSeconds: z.number().int().min(60).max(86_400).optional() }),
  z.object({ type: z.literal("advance"), durationSeconds: z.number().int().min(60).max(86_400).optional() }),
  z.object({ type: z.literal("reset") }),
  z.object({ type: z.literal("force"), teamId: z.string(), choiceId: z.string() }),
  z.object({ type: z.literal("force-complete-without-file"), teamId: z.string() }),
  z.object({ type: z.literal("demo-select"), teamId: z.string(), choiceId: z.string() }),
  z.object({ type: z.literal("demo-confirm"), teamId: z.string() }),
  z.object({ type: z.literal("demo-file"), teamId: z.string() }),
  z.object({ type: z.literal("resend"), teamId: z.string().optional() }),
]);

async function deliver(teamId?: string) {
  const snapshot = await gameStore.snapshot();
  const teams = teamId ? snapshot.teams.filter((team) => team.id === teamId) : snapshot.teams;
  await Promise.all(
    teams.map(async (team) => {
      const bot = getBotConfig(team.botKey);
      if (!team.captainChatId) return;
      if (!bot?.token) {
        await gameStore.setDelivery(team.id, "failed", `Не настроен Telegram-токен ${team.botKey}`);
        return;
      }
      try {
        await sendCurrentStage(bot, team);
        await gameStore.setDelivery(team.id, "sent");
      } catch (error) {
        await gameStore.setDelivery(team.id, "failed", error instanceof Error ? error.message : "Ошибка доставки");
      }
    }),
  );
}

async function forceCompatibleChoice(teamId: string, choiceId: string) {
  let team = await gameStore.getTeam(teamId);
  const choiceIds = expandLegacyChoiceId(team.color, team.currentStageIndex, choiceId) ?? [choiceId];

  for (const compatibleChoiceId of choiceIds) {
    team = await gameStore.getTeam(teamId);
    const stage = getScenarioStage(team, team.currentStageIndex);
    if (stage?.choices.some((choice) => choice.id === compatibleChoiceId)) {
      await gameStore.forceResolve(teamId, compatibleChoiceId);
      continue;
    }
    const alreadyRecorded = team.history.some(
      (decision) => decision.stageIndex === team.currentStageIndex && decision.choiceId === compatibleChoiceId,
    );
    if (!alreadyRecorded) throw new Error("Недопустимый вариант");
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректная команда" }, { status: 400 });

  try {
    const action = parsed.data;
    switch (action.type) {
      case "start":
        await gameStore.startGame(action.durationSeconds);
        await deliver();
        break;
      case "advance":
        await gameStore.advanceGame(action.durationSeconds);
        if ((await gameStore.snapshot()).game.status === "running") await deliver();
        break;
      case "reset":
        await gameStore.reset();
        break;
      case "force":
        await forceCompatibleChoice(action.teamId, action.choiceId);
        break;
      case "force-complete-without-file":
        await gameStore.forceCompleteWithoutFile(action.teamId);
        break;
      case "demo-select":
        await gameStore.selectChoice(action.teamId, action.choiceId);
        break;
      case "demo-confirm":
        await gameStore.confirmChoice(action.teamId);
        break;
      case "demo-file":
        await gameStore.attachFile(action.teamId, `budget-${action.teamId}.xlsx`, "demo-file");
        break;
      case "resend":
        await deliver(action.teamId);
        break;
    }
    return NextResponse.json(await gameStore.snapshot());
  } catch (error) {
    const known = error as Error & { blockers?: string[] };
    return NextResponse.json(
      { error: known.message, blockers: known.blockers },
      { status: known.blockers ? 409 : 400 },
    );
  }
}

export async function availableChoices(teamId: string) {
  const team = await gameStore.getTeam(teamId);
  return getScenarioStage(team, team.currentStageIndex)?.choices ?? [];
}

import type { ScenarioStage, TeamState } from "@/lib/domain/types";

const firstStage: ScenarioStage = {
  id: "prototype-q1-client-discount",
  title: "Этап 1. Новый клиент",
  situation:
    "Крупный клиент готов начать проект в этом квартале, но просит скидку 10%. Команда уже загружена на 85%.",
  choices: [
    { id: "accept-discount", label: "Дать скидку и начать проект" },
    { id: "protect-margin", label: "Не давать скидку и продолжить переговоры" },
  ],
  fileRequired: true,
};

const secondBase = {
  id: "prototype-q2-capacity",
  title: "Этап 2. Последствия решения",
  choices: [
    { id: "hire", label: "Срочно нанять специалиста" },
    { id: "rebalance", label: "Перераспределить текущую команду" },
  ],
  fileRequired: true,
} satisfies Omit<ScenarioStage, "situation">;

export const scenarioLength = 2;

export function getScenarioStage(team: TeamState, stageIndex: number): ScenarioStage {
  if (stageIndex === 0) return firstStage;

  if (stageIndex === 1) {
    const previous = team.history.find((item) => item.stageIndex === 0);
    const consequence =
      previous?.choiceId === "accept-discount"
        ? "Клиент согласился, но из-за скидки маржинальность снизилась, а загрузка команды превысила 100%."
        : "Переговоры затянулись: маржа сохранена, но старт проекта сдвинулся и появилась свободная ёмкость команды.";

    return {
      ...secondBase,
      situation: `${consequence} Как вы скорректируете ресурсный план?`,
    };
  }

  throw new Error(`Неизвестный этап сценария: ${stageIndex}`);
}

import { describe, expect, it } from "vitest";
import type { DecisionRecord, TeamState } from "@/lib/domain/types";
import { getScenarioStage, scenarioLength } from "@/lib/scenario";

function team(color: TeamState["color"], choices: string[] = []): TeamState {
  const history: DecisionRecord[] = choices.map((choiceId, stageIndex) => ({
    stageIndex,
    stageId: `stage-${stageIndex}`,
    choiceId,
    source: "captain",
    confirmedAt: "2026-08-11T00:00:00.000Z",
  }));
  return {
    id: color === "red" ? "team-1" : "team-5",
    number: color === "red" ? 1 : 5,
    name: "Test team",
    color,
    botKey: color === "red" ? "team-1" : "team-5",
    status: "awaiting-decision",
    currentStageIndex: choices.length,
    delivery: { status: "not-sent" },
    history,
  };
}

describe("final team scenarios", () => {
  it("contains four color-specific stages", () => {
    expect(scenarioLength).toBe(4);
    expect(getScenarioStage(team("red"), 0).situation).toContain("«Якорь»");
    expect(getScenarioStage(team("blue"), 0).situation).toContain("«Шахта»");
  });

  it("offers every combination of the three blue Q2 decisions", () => {
    const stage = getScenarioStage(team("blue", ["hold-rate"]), 1);
    expect(stage.choices).toHaveLength(8);
    expect(stage.choices.map((choice) => choice.id)).toContain("hire-pr-bonus");
    expect(stage.choices.map((choice) => choice.id)).toContain("nohire-nopr-nobonus");
  });

  it("asks the red team a yes-or-no budget forecast question in Q3", () => {
    const stage = getScenarioStage(team("red", ["urgent-hire", "hire-q3"]), 2);
    expect(stage.situation).toContain(
      "Вы будете что-то менять в Прогнозе года, чтобы выполнить цели Бюджета?",
    );
    expect(stage.choices).toEqual([
      { id: "keep-profit-target", label: "Да" },
      { id: "revise-profit-target", label: "Нет" },
    ]);
    expect(stage.fileRequired).toBe(true);
  });

  it("applies the red staffing branch to the final client situation", () => {
    const hired = getScenarioStage(team("red", ["urgent-hire", "hire-q3", "keep-profit-target"]), 3);
    const contractors = getScenarioStage(
      team("red", ["use-contractors", "gamma-contractors-q3", "revise-profit-target"]),
      3,
    );
    expect(hired.situation).toContain("есть ресурсы");
    expect(contractors.situation).toContain("срочно нанять одного консультанта");
  });

  it("applies PR and bonus decisions to the blue Q3 crisis", () => {
    const pr = getScenarioStage(team("blue", ["hold-rate", "nohire-pr-nobonus"]), 2);
    const noPrNoBonus = getScenarioStage(team("blue", ["hold-rate", "nohire-nopr-nobonus"]), 2);
    expect(pr.choices[0].label).toContain("сокращение рамок");
    expect(noPrNoBonus.choices[0].label).toContain("продавец уволится");
  });

  it("shows whether the blue team can take the Ptitsa project", () => {
    const canTake = getScenarioStage(
      team("blue", ["hold-rate", "hire-nopr-bonus", "continue-own-cost"]),
      3,
    );
    const cannotTake = getScenarioStage(
      team("blue", ["hold-rate", "nohire-pr-nobonus", "continue-own-cost"]),
      3,
    );
    expect(canTake.situation).toContain("может добавить 7 млн рублей");
    expect(cannotTake.situation).toContain("не может взять этот проект");
  });
});

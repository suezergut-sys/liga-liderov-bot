import { describe, expect, it } from "vitest";
import type { DecisionRecord, TeamState } from "@/lib/domain/types";
import { getScenarioStage, scenarioLength } from "@/lib/scenario";

type TestDecision = Pick<DecisionRecord, "stageIndex" | "stageId" | "choiceId">;

function team(color: TeamState["color"], decisions: TestDecision[] = []): TeamState {
  const history: DecisionRecord[] = decisions.map((decision, index) => ({
    ...decision,
    source: "captain",
    confirmedAt: `2026-08-11T00:00:${String(index).padStart(2, "0")}.000Z`,
  }));
  return {
    id: color === "red" ? "team-1" : "team-5",
    number: color === "red" ? 1 : 5,
    name: "Test team",
    color,
    botKey: color === "red" ? "team-1" : "team-5",
    status: "awaiting-decision",
    currentStageIndex: 0,
    delivery: { status: "not-sent" },
    history,
  };
}

const decision = (stageIndex: number, stageId: string, choiceId: string): TestDecision => ({
  stageIndex,
  stageId,
  choiceId,
});

describe("multi-step team scenarios", () => {
  it("contains four color-specific global stages", () => {
    expect(scenarioLength).toBe(4);
    expect(getScenarioStage(team("red"), 0)?.situation).toContain("«Якорь»");
    expect(getScenarioStage(team("blue"), 0)?.situation).toContain("«Шахта»");
  });

  it("opens two separately confirmed red Q2 steps and applies the Q1 consequence", () => {
    const q1Hire = decision(0, "red-q1-yakor-modernization", "urgent-hire");
    const staffing = getScenarioStage(team("red", [q1Hire]), 1)!;
    expect(staffing.id).toBe("red-q2-staffing");
    expect(staffing.choices).toHaveLength(2);
    expect(staffing.fileRequired).toBe(false);

    const start = getScenarioStage(team("red", [
      q1Hire,
      decision(1, "red-q2-staffing", "hire-two-consultants"),
    ]), 1)!;
    expect(start.id).toBe("red-q2-yakor-start");
    expect(start.fileRequired).toBe(true);
    expect(start.choices.find((choice) => choice.id === "start-yakor-q3")?.result).toContain("простаивать");

    const contractorStart = getScenarioStage(team("red", [
      decision(0, "red-q1-yakor-modernization", "use-contractors"),
      decision(1, "red-q2-staffing", "use-gamma-contractors"),
    ]), 1)!;
    expect(contractorStart.choices.find((choice) => choice.id === "start-yakor-q3")?.result).toContain("10%");
  });

  it("opens the three blue Q2 questions one by one", () => {
    const q1 = decision(0, "blue-q1-shahta-discount", "hold-rate");
    const hiring = getScenarioStage(team("blue", [q1]), 1)!;
    expect(hiring.id).toBe("blue-q2-vyshka-hiring");
    expect(hiring.fileRequired).toBe(false);

    const prDecision = decision(1, hiring.id, "hire-consultants");
    const pr = getScenarioStage(team("blue", [q1, prDecision]), 1)!;
    expect(pr.id).toBe("blue-q2-vyshka-pr");
    expect(pr.fileRequired).toBe(false);

    const bonus = getScenarioStage(team("blue", [
      q1,
      prDecision,
      decision(1, pr.id, "run-pr"),
    ]), 1)!;
    expect(bonus.id).toBe("blue-q2-seller-bonus");
    expect(bonus.choices.map((choice) => choice.label)).toEqual(["Да", "Нет"]);
    expect(bonus.fileRequired).toBe(true);
  });

  it("keeps the approved red Q3 forecast question and yes-or-no choices", () => {
    const stage = getScenarioStage(team("red"), 2)!;
    expect(stage.situation).toContain(
      "Вы будете что-то менять в Прогнозе года, чтобы выполнить цели Бюджета?",
    );
    expect(stage.choices).toEqual([
      { id: "change-forecast", label: "Да" },
      { id: "keep-forecast", label: "Нет" },
    ]);
  });

  it("shows the red final consequence after the discount decision", () => {
    const hired = getScenarioStage(team("red", [
      decision(1, "red-q2-staffing", "hire-two-consultants"),
    ]), 3)!;
    expect(hired.choices.find((choice) => choice.id === "give-discount")?.result).toContain("утилизация 100%");
    expect(hired.choices.find((choice) => choice.id === "refuse-discount")?.result).toContain("простаивать");

    const contractors = getScenarioStage(team("red", [
      decision(1, "red-q2-staffing", "use-gamma-contractors"),
    ]), 3)!;
    expect(contractors.choices.find((choice) => choice.id === "give-discount")?.result).toContain("срочно нанять одного");
  });

  it("uses the corrected bonus logic when the blue team stops Vyshka without PR", () => {
    const base = [
      decision(1, "blue-q2-vyshka-hiring", "do-not-hire-consultants"),
      decision(1, "blue-q2-vyshka-pr", "skip-pr"),
    ];
    const paid = getScenarioStage(team("blue", [
      ...base,
      decision(1, "blue-q2-seller-bonus", "pay-bonus-advance"),
    ]), 2)!;
    const declined = getScenarioStage(team("blue", [
      ...base,
      decision(1, "blue-q2-seller-bonus", "decline-bonus-advance"),
    ]), 2)!;
    expect(paid.choices.find((choice) => choice.id === "stop-project")?.result).toContain("остаётся");
    expect(declined.choices.find((choice) => choice.id === "stop-project")?.result).toContain("увольняется");
  });

  it("applies seller and capacity history to the blue final consequence", () => {
    const finalSituation = (hiring: string, pr: string, bonus: string, q3: string) => getScenarioStage(team("blue", [
      decision(1, "blue-q2-vyshka-hiring", hiring),
      decision(1, "blue-q2-vyshka-pr", pr),
      decision(1, "blue-q2-seller-bonus", bonus),
      decision(2, "blue-q3-vyshka-crisis", q3),
    ]), 3)!.situation;

    expect(finalSituation("hire-consultants", "skip-pr", "decline-bonus-advance", "continue-own-cost")).toContain("может добавить 7 млн");
    expect(finalSituation("do-not-hire-consultants", "run-pr", "decline-bonus-advance", "continue-own-cost")).toContain("не может взять");
    expect(finalSituation("do-not-hire-consultants", "skip-pr", "pay-bonus-advance", "stop-project")).toContain("ресурсы освободились");
    expect(finalSituation("do-not-hire-consultants", "skip-pr", "decline-bonus-advance", "stop-project")).toContain("продавец ушёл");
    expect(finalSituation("hire-consultants", "run-pr", "decline-bonus-advance", "stop-project")).toContain("может добавить 7 млн");
  });
});

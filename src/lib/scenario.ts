import type { Choice, ScenarioStage, TeamState } from "@/lib/domain/types";

export const scenarioLength = 4;

function previousChoice(team: TeamState, stageIndex: number) {
  return team.history.find((item) => item.stageIndex === stageIndex)?.choiceId;
}

function requiredStage(
  id: string,
  title: string,
  situation: string,
  choices: Choice[],
): ScenarioStage {
  return { id, title, situation, choices, fileRequired: true };
}

function redStage(team: TeamState, stageIndex: number): ScenarioStage {
  if (stageIndex === 0) {
    return requiredStage(
      "red-q1-yakor-modernization",
      "Этап 1. Начало Q1 (апрель)",
      "Клиент «Якорь» предлагает дополнительный проект по модернизации со скидкой 10% относительно текущих ставок. Выручка — 2,7 млн рублей. Через месяц заказчик требует показать команду и обещает начать проект сразу после знакомства с ней.",
      [
        { id: "urgent-hire", label: "Срочно нанять 2 старших консультантов (+10% к зарплате)" },
        { id: "use-contractors", label: "Выполнить проект подрядчиками (маржинальность 20%)" },
      ],
    );
  }

  if (stageIndex === 1) {
    const q1Choice = previousChoice(team, 0);
    const q1Consequence = q1Choice === "urgent-hire"
      ? "В Q1 вы наняли двух старших консультантов: при старте сейчас они получат коммерческую загрузку, а при переносе на Q3 будут простаивать."
      : "В Q1 вы выбрали подрядчиков: при старте сейчас они потребуют акты в текущем календарном году раньше доходного акта, а при ожидании до Q3 их маржинальность упадёт до 10%.";

    return requiredStage(
      "red-q2-staffing-and-yakor-start",
      "Этап 2. Начало Q2 (июль)",
      `Две старшие консультантки уходят в декрет. Одновременно модернизация «Якоря» не началась: договор получится подписать только в январе, тогда же придёт выручка, а завершить работы нужно не позднее января. Решите, как заменить сотрудниц и когда начать модернизацию. ${q1Consequence}`,
      [
        { id: "hire-now", label: "Нанять 2 СК через месяц; начать модернизацию сейчас" },
        { id: "hire-q3", label: "Нанять 2 СК через месяц; начать модернизацию в Q3" },
        { id: "gamma-contractors-now", label: "Передать «Гамму» подрядчикам; начать модернизацию сейчас" },
        { id: "gamma-contractors-q3", label: "Передать «Гамму» подрядчикам; начать модернизацию в Q3" },
      ],
    );
  }

  if (stageIndex === 2) {
    return requiredStage(
      "red-q3-profit-target",
      "Этап 3. Начало Q3 (октябрь)",
      "«Якорь» готов заактировать модернизацию в январе, но категорически не повышает ставки за регулярную поддержку, хотя повышение было заложено в бюджет. С Q4 зарплаты сотрудников нужно повысить на 10%; остальные клиенты согласны повысить ставки только на 5%. Вы будете что-то менять в Прогнозе года, чтобы выполнить цели Бюджета?",
      [
        { id: "keep-profit-target", label: "Да" },
        { id: "revise-profit-target", label: "Нет" },
      ],
    );
  }

  if (stageIndex === 3) {
    const hiredInQ2 = previousChoice(team, 1)?.startsWith("hire-") ?? false;
    const capacityConsequence = hiredInQ2
      ? "Так как в Q2 вы наняли двух старших консультантов, в Q4 у команды есть ресурсы, но их утилизация достигнет 100%."
      : "Так как в Q2 вы не наняли двух старших консультантов, для нового проекта потребуется срочно нанять одного консультанта с окладом на 10% выше обычного.";

    return requiredStage(
      "red-q3-new-client",
      "Этап 4. Конец Q3 (декабрь)",
      `Новый клиент готов перейти к вам от конкурента с Q4, но просит скидку 10% относительно ваших ставок. Выручка — 2 млн рублей в квартал; привлечь подрядчика нельзя. ${capacityConsequence}`,
      [
        { id: "give-discount", label: "Дать скидку и взять клиента" },
        { id: "refuse-discount", label: "Не давать скидку и принять риск потери клиента" },
      ],
    );
  }

  throw new Error(`Неизвестный этап красного сценария: ${stageIndex}`);
}

function blueQ2Choices(): Choice[] {
  const choices: Choice[] = [];
  for (const hire of [true, false]) {
    for (const pr of [true, false]) {
      for (const bonus of [true, false]) {
        choices.push({
          id: `${hire ? "hire" : "nohire"}-${pr ? "pr" : "nopr"}-${bonus ? "bonus" : "nobonus"}`,
          label: `Найм: ${hire ? "да" : "нет"}; PR: ${pr ? "да" : "нет"}; аванс бонуса: ${bonus ? "да" : "нет"}`,
        });
      }
    }
  }
  return choices;
}

function blueStage(team: TeamState, stageIndex: number): ScenarioStage {
  if (stageIndex === 0) {
    return requiredStage(
      "blue-q1-shahta-discount",
      "Этап 1. Начало Q1 (апрель)",
      "Клиент «Шахта» пришёл по рекомендации и просит скидку 10%. Проект рассчитан на Q1 и Q2 и не повысит утилизацию команды.",
      [
        { id: "discount-start", label: "Дать скидку и начать сейчас (выручка ниже на 10%)" },
        { id: "hold-rate", label: "Не давать скидку и принять риск долгих переговоров" },
      ],
    );
  }

  if (stageIndex === 1) {
    const shahtaOutcome = previousChoice(team, 0) === "hold-rate"
      ? "«Шахта» согласилась на ваши условия без скидки."
      : "Проект «Шахты» продолжается с предоставленной скидкой.";
    return requiredStage(
      "blue-q2-vyshka-package",
      "Этап 2. Начало Q2 (июль)",
      `${shahtaOutcome} Вы выиграли проект «Вышки» по новой для вас теме со скидкой 10%: выручка 56 млн рублей — 25 млн в Q3 и 31 млн в Q4. Производственный персонал загружен на 90% до конца года. Одновременно решите: нанимать ли двух старших консультантов; проводить ли за свой счёт PR-мероприятие за 15 млн рублей; выплачивать ли продавцу авансом 30% бюджетного бонуса на ипотеку.`,
      blueQ2Choices(),
    );
  }

  if (stageIndex === 2) {
    const q2Choice = previousChoice(team, 1) ?? "";
    const hadPr = q2Choice.includes("-pr-");
    const paidBonus = q2Choice.endsWith("-bonus");
    const stopLabel = hadPr
      ? "Остановить исходный план и согласовать с «Вышкой» сокращение рамок"
      : `Остановить проект: выручка обнулится, продавец ${paidBonus ? "останется" : "уволится"}`;

    return requiredStage(
      "blue-q3-vyshka-crisis",
      "Этап 3. Начало Q3 (октябрь)",
      "Руководитель проекта «Вышки» уверен, что трудоёмкость и сроки недооценены в два раза. Прогнозная выручка сдвигается на квартал — в Q4 и новый финансовый год, а заказчик не хочет расширять бюджет. Если продолжить за свой счёт, сроки и трудоёмкость затем увеличатся ещё на 30% к новой оценке, и актов в текущем финансовом году не будет.",
      [
        { id: "stop-project", label: stopLabel },
        { id: "continue-own-cost", label: "Продолжить, взяв перерасход бюджета на себя" },
      ],
    );
  }

  if (stageIndex === 3) {
    const q2Choice = previousChoice(team, 1) ?? "";
    const q3Choice = previousChoice(team, 2);
    const hired = q2Choice.startsWith("hire-");
    const hadPr = q2Choice.includes("-pr-");
    const paidBonus = q2Choice.endsWith("-bonus");
    const stopped = q3Choice === "stop-project";
    const sellerStayed = !stopped || hadPr || paidBonus;
    const lostVyshka = stopped && !hadPr;
    const canTakePtitsa = sellerStayed && ((hired && !stopped) || lostVyshka);

    let consequence: string;
    if (!sellerStayed) {
      consequence = "Проект «Вышки» остановлен, его выручка обнулена, а продавец ушёл — нового клиента «Птица» команда не получает.";
    } else if (canTakePtitsa) {
      consequence = "Продавец остался и привёл клиента «Птица» на типовой проект в Q4. Команда может добавить 7 млн рублей выручки: либо были наняты люди и «Вышка» продолжается, либо «Вышка» потеряна и ресурсы освободились.";
    } else if (hired && stopped && hadPr) {
      consequence = "После PR-мероприятия «Вышка» согласилась сократить рамки проекта, продавец остался. Зафиксируйте последствия принятых решений в прогнозе.";
    } else {
      consequence = "Продавец остался и привёл клиента «Птица», но при продолжающейся «Вышке» без найма новых людей команда не может взять этот проект. Срочный найм и подряд недоступны.";
    }

    return requiredStage(
      "blue-q3-ptitsa-consequences",
      "Этап 4. Конец Q3",
      consequence,
      [{ id: "record-consequences", label: "Зафиксировать последствия в финансовом прогнозе" }],
    );
  }

  throw new Error(`Неизвестный этап синего сценария: ${stageIndex}`);
}

export function getScenarioStage(team: TeamState, stageIndex: number): ScenarioStage {
  return team.color === "red" ? redStage(team, stageIndex) : blueStage(team, stageIndex);
}

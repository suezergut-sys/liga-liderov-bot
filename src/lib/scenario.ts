import type { Choice, ScenarioStage, TeamState } from "@/lib/domain/types";

export const scenarioLength = 4;

function previousChoice(team: TeamState, stageIndex: number, stepId: string) {
  return team.history.find(
    (item) => item.stageIndex === stageIndex && item.stageId === stepId,
  )?.choiceId;
}

function step(
  id: string,
  title: string,
  situation: string,
  choices: Choice[],
  fileRequired: boolean,
): ScenarioStage {
  return { id, title, situation, choices, fileRequired };
}

function redStage(team: TeamState, stageIndex: number): ScenarioStage | undefined {
  if (stageIndex === 0) {
    if (previousChoice(team, 0, "red-q1-yakor-modernization")) return undefined;
    return step(
      "red-q1-yakor-modernization",
      "Этап 1. Начало Q1 (апрель)",
      "Клиент «Якорь» предлагает дополнительный проект по модернизации со скидкой 10% относительно текущих ставок. Выручка — 2,7 млн рублей. Через месяц заказчик требует показать команду и обещает начать проект сразу после знакомства с ней.",
      [
        { id: "urgent-hire", label: "Срочно нанять 2 старших консультантов (+10% к зарплате)" },
        { id: "use-contractors", label: "Выполнить проект подрядчиками (маржинальность 20%)" },
      ],
      true,
    );
  }

  if (stageIndex === 1) {
    const staffingStepId = "red-q2-staffing";
    if (!previousChoice(team, 1, staffingStepId)) {
      return step(
        staffingStepId,
        "Этап 2. Начало Q2 (июль) — шаг 1 из 2",
        "Две старшие консультантки уходят в декрет. Решите, как заменить их на проекте «Гамма».",
        [
          { id: "hire-two-consultants", label: "Нанять 2 старших консультантов через месяц" },
          { id: "use-gamma-contractors", label: "Передать «Гамму» подрядчикам с маржинальностью 20%" },
        ],
        false,
      );
    }

    const startStepId = "red-q2-yakor-start";
    if (previousChoice(team, 1, startStepId)) return undefined;
    const q1Choice = previousChoice(team, 0, "red-q1-yakor-modernization");
    const startNowResult = q1Choice === "urgent-hire"
      ? "Нанятые в Q1 старшие консультанты получают коммерческую загрузку."
      : "Подрядчик готов начать только при условии актирования работ в текущем календарном году — раньше доходного акта «Якоря».";
    const startQ3Result = q1Choice === "urgent-hire"
      ? "Два старших консультанта, нанятые в Q1, будут простаивать до начала Q3."
      : "Подрядчик готов ждать до Q3, но маржинальность работ снизится до 10%.";

    return step(
      startStepId,
      "Этап 2. Начало Q2 (июль)",
      "Проект модернизации «Якоря» так и не начался. Договор получится подписать только в январе, потому что в текущем году бюджета нет; тогда же придёт выручка. Работы необходимо закончить не позднее января. Когда начинать модернизацию?",
      [
        { id: "start-yakor-now", label: "Начать работы сейчас под честное слово", result: startNowResult },
        { id: "start-yakor-q3", label: "Начать в Q3 после официального запуска выбора поставщика", result: startQ3Result },
      ],
      true,
    );
  }

  if (stageIndex === 2) {
    if (previousChoice(team, 2, "red-q3-profit-target")) return undefined;
    return step(
      "red-q3-profit-target",
      "Этап 3. Начало Q3 (октябрь)",
      "«Якорь» готов заактировать модернизацию в январе, но категорически не повышает ставки за регулярную поддержку, хотя повышение было заложено в бюджет. С Q4 зарплаты сотрудников нужно повысить на 10%; остальные клиенты согласны повысить ставки только на 5%. Вы будете что-то менять в Прогнозе года, чтобы выполнить цели Бюджета?",
      [
        { id: "change-forecast", label: "Да" },
        { id: "keep-forecast", label: "Нет" },
      ],
      true,
    );
  }

  if (stageIndex === 3) {
    const finalStepId = "red-q3-new-client";
    if (previousChoice(team, 3, finalStepId)) return undefined;
    const hiredInQ2 = previousChoice(team, 1, "red-q2-staffing") === "hire-two-consultants";
    const acceptResult = hiredInQ2
      ? "Клиент ваш. Два старших консультанта, нанятые в Q2, получают загрузку; у команды будет утилизация 100% в Q4."
      : "Клиент ваш. Для проекта нужно срочно нанять одного консультанта с окладом на 10% выше обычного.";
    const refuseResult = hiredInQ2
      ? "Клиент уходит. Новых сотрудников не нанимаем, а два старших консультанта, нанятые в Q2, будут простаивать."
      : "Клиент уходит. Новых сотрудников не нанимаем.";

    return step(
      finalStepId,
      "Этап 4. Конец Q3 (декабрь)",
      "Новый клиент готов перейти к вам от конкурента с Q4, но просит скидку 10% относительно ваших ставок. Выручка — 2 млн рублей в квартал; привлечь подрядчика нельзя.",
      [
        { id: "give-discount", label: "Дать скидку", result: acceptResult },
        { id: "refuse-discount", label: "Не давать скидку", result: refuseResult },
      ],
      true,
    );
  }

  throw new Error(`Неизвестный этап красного сценария: ${stageIndex}`);
}

function blueStage(team: TeamState, stageIndex: number): ScenarioStage | undefined {
  if (stageIndex === 0) {
    if (previousChoice(team, 0, "blue-q1-shahta-discount")) return undefined;
    return step(
      "blue-q1-shahta-discount",
      "Этап 1. Начало Q1 (апрель)",
      "Клиент «Шахта» пришёл по рекомендации и просит скидку 10%. Проект рассчитан на Q1 и Q2 и не повысит утилизацию команды.",
      [
        { id: "discount-start", label: "Дать скидку и начать сейчас", result: "Выручка от проекта «Шахты» будет ниже на 10%." },
        { id: "hold-rate", label: "Не давать скидку", result: "Появляется риск не законтрактоваться или уйти в долгие переговоры; пока выручка в Прогнозе не уменьшается." },
      ],
      true,
    );
  }

  if (stageIndex === 1) {
    const hiringStepId = "blue-q2-vyshka-hiring";
    const shahtaOutcome = previousChoice(team, 0, "blue-q1-shahta-discount") === "hold-rate"
      ? "«Шахта» согласилась на ваши условия без скидки."
      : "Проект «Шахты» продолжается с предоставленной скидкой.";
    if (!previousChoice(team, 1, hiringStepId)) {
      return step(
        hiringStepId,
        "Этап 2. Начало Q2 (июль) — шаг 1 из 3",
        `${shahtaOutcome} Вы выиграли проект «Вышки» по новой для вас теме со скидкой 10%: выручка 56 млн рублей — 25 млн в Q3 и 31 млн в Q4. Производственный персонал загружен на 90% до конца года. Нанимаем ещё двух старших консультантов, учитывая, что вся текущая команда занята на проектах?`,
        [
          { id: "hire-consultants", label: "Да" },
          { id: "do-not-hire-consultants", label: "Нет" },
        ],
        false,
      );
    }

    const prStepId = "blue-q2-vyshka-pr";
    if (!previousChoice(team, 1, prStepId)) {
      return step(
        prStepId,
        "Этап 2. Начало Q2 (июль) — шаг 2 из 3",
        "«Вышка» предлагает провести за ваш счёт PR-мероприятие о старте проекта. Это дополнительные 15 млн рублей расходов на маркетинг, которых не было в Бюджете. Проводим мероприятие?",
        [
          { id: "run-pr", label: "Да" },
          { id: "skip-pr", label: "Нет" },
        ],
        false,
      );
    }

    const bonusStepId = "blue-q2-seller-bonus";
    if (previousChoice(team, 1, bonusStepId)) return undefined;
    return step(
      bonusStepId,
      "Этап 2. Начало Q2 (июль) — шаг 3 из 3",
      "Продавец просит авансом 30% бонуса, заложенного в Бюджет за продажу «Вышки», чтобы оплатить ипотеку. Выплачиваем аванс?",
      [
        { id: "pay-bonus-advance", label: "Да" },
        { id: "decline-bonus-advance", label: "Нет" },
      ],
      true,
    );
  }

  if (stageIndex === 2) {
    const crisisStepId = "blue-q3-vyshka-crisis";
    if (previousChoice(team, 2, crisisStepId)) return undefined;
    const hadPr = previousChoice(team, 1, "blue-q2-vyshka-pr") === "run-pr";
    const paidBonus = previousChoice(team, 1, "blue-q2-seller-bonus") === "pay-bonus-advance";
    const stopResult = hadPr
      ? "Благодаря PR-мероприятию «Вышка» готова уменьшить рамки проекта под ранее выделенный бюджет. Продавец остаётся."
      : `Проект остановлен, выручка по нему обнуляется. Продавец ${paidBonus ? "остаётся, потому что получил аванс бонуса" : "увольняется, потому что не получил аванс бонуса"}.`;

    return step(
      crisisStepId,
      "Этап 3. Начало Q3 (октябрь)",
      "Руководитель проекта «Вышки» уверен, что трудоёмкость и сроки недооценены в два раза. Прогнозная выручка сдвигается на квартал — в Q4 и новый финансовый год, а заказчик не хочет расширять бюджет.",
      [
        { id: "stop-project", label: "Сообщить «Вышке», что мы не готовы продолжать проект", result: stopResult },
        { id: "continue-own-cost", label: "Продолжить, взяв перерасход бюджета на себя", result: "Сроки и трудоёмкость увеличатся ещё на 30% к новой оценке. Актов в текущем финансовом году не будет." },
      ],
      true,
    );
  }

  if (stageIndex === 3) {
    const q3Choice = previousChoice(team, 2, "blue-q3-vyshka-crisis");
    const hired = previousChoice(team, 1, "blue-q2-vyshka-hiring") === "hire-consultants";
    const hadPr = previousChoice(team, 1, "blue-q2-vyshka-pr") === "run-pr";
    const paidBonus = previousChoice(team, 1, "blue-q2-seller-bonus") === "pay-bonus-advance";
    const stopped = q3Choice === "stop-project";
    const sellerStayed = !stopped || hadPr || paidBonus;
    const lostVyshka = stopped && !hadPr;
    const vyshkaContinues = !stopped || hadPr;
    const canTakePtitsa = sellerStayed && ((hired && vyshkaContinues) || lostVyshka);

    let consequence: string;
    if (!sellerStayed) {
      consequence = "Проект «Вышки» остановлен, его выручка обнулена, а продавец ушёл — нового клиента «Птица» команда не получает.";
    } else if (canTakePtitsa) {
      const capacityReason = lostVyshka
        ? "«Вышка» потеряна, поэтому ресурсы освободились"
        : "в Q2 были наняты новые сотрудники, а «Вышка» продолжается";
      consequence = `Продавец остался и привёл клиента «Птица» на типовой проект в Q4. Подряд и срочный найм невозможны. Команда может добавить 7 млн рублей выручки: ${capacityReason}.`;
    } else {
      consequence = "Продавец остался и привёл клиента «Птица», но при продолжающейся «Вышке» без найма новых людей команда не может взять этот проект. Срочный найм и подряд недоступны.";
    }

    return step(
      "blue-q3-ptitsa-consequences",
      "Этап 4. Конец Q3",
      consequence,
      [],
      true,
    );
  }

  throw new Error(`Неизвестный этап синего сценария: ${stageIndex}`);
}

export function getScenarioStage(team: TeamState, stageIndex: number): ScenarioStage | undefined {
  return team.color === "red" ? redStage(team, stageIndex) : blueStage(team, stageIndex);
}

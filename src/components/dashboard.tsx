"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameSnapshot, TeamState } from "@/lib/domain/types";
import { getScenarioStage, scenarioLength } from "@/lib/scenario";

const statusLabels: Record<TeamState["status"], string> = {
  waiting: "Ожидает старта",
  "awaiting-decision": "Принимает решение",
  "decision-selected": "Подтверждает выбор",
  "awaiting-file": "Загружает файл",
  ready: "Готова",
  completed: "Игра завершена",
};

function formatCountdown(deadlineAt: string | undefined, now: number, durationSeconds: number) {
  const remaining = deadlineAt ? Math.max(0, new Date(deadlineAt).getTime() - now) : durationSeconds * 1000;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<GameSnapshot>();
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string>();
  const [password, setPassword] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stageDurationMinutes, setStageDurationMinutes] = useState(10);
  const durationInitialized = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (response.status === 401) {
      setNeedsLogin(true);
      return;
    }
    if (!response.ok) throw new Error("Не удалось загрузить панель");
    setNeedsLogin(false);
    setSnapshot((await response.json()) as GameSnapshot);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      setNow(Date.now());
      load().catch((value) => setError(value.message));
    }, 0);
    const polling = window.setInterval(() => load().catch(() => undefined), 3000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(polling);
      window.clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    if (!snapshot || durationInitialized.current) return;
    setStageDurationMinutes(snapshot.game.durationSeconds / 60);
    durationInitialized.current = true;
  }, [snapshot]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Действие не выполнено");
      setSnapshot(result as GameSnapshot);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неизвестная ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError("Неверный пароль");
      return;
    }
    setPassword("");
    await load();
  }

  const readyCount = snapshot?.teams.filter((team) => team.status === "ready" || team.status === "completed").length ?? 0;
  const effectiveNow = now || new Date(snapshot?.serverNow ?? 0).getTime();
  const timer = formatCountdown(snapshot?.game.deadlineAt, effectiveNow, snapshot?.game.durationSeconds ?? 600);
  const timerExpired = Boolean(snapshot?.game.deadlineAt && new Date(snapshot.game.deadlineAt).getTime() <= effectiveNow);
  const durationIsValid = Number.isInteger(stageDurationMinutes) && stageDurationMinutes >= 1 && stageDurationMinutes <= 1440;

  const stageLabel = useMemo(() => {
    if (!snapshot || snapshot.game.currentStageIndex < 0) return "Игра не начата";
    if (snapshot.game.status === "completed") return "Игра завершена";
    return `Этап ${snapshot.game.currentStageIndex + 1} из ${scenarioLength}`;
  }, [snapshot]);

  if (needsLogin) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={login}>
          <span className="eyebrow">Лига лидеров</span>
          <h1>Пульт организатора</h1>
          <p>Введите пароль, заданный в переменной ADMIN_PASSWORD.</p>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
          <button type="submit">Войти</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  if (!snapshot) return <main className="loading">Загружаем пульт…</main>;

  return (
    <main>
      <header className="topbar">
        <div className="hero-heading">
          <Image
            className="hero-image"
            src="/images/we-are-in-profit.png"
            alt="Команды финансовой игры — Мы в плюсе"
            width={156}
            height={156}
            preload
          />
          <div>
            <span className="eyebrow">Финансовая деловая игра</span>
            <h1>Лига лидеров</h1>
          </div>
        </div>
        <div className="topbar-actions">
          {snapshot.demoMode && <span className="demo-badge">Demo mode</span>}
          <button className="ghost" disabled={busy} onClick={() => action({ type: "reset" })}>Сбросить</button>
        </div>
      </header>

      <section className="control-panel">
        <div>
          <span className="label">Текущий статус</span>
          <strong>{stageLabel}</strong>
        </div>
        <div>
          <span className="label">Готовность</span>
          <strong>{readyCount} / 7 команд</strong>
        </div>
        <div className={timerExpired ? "timer expired" : "timer"}>
          <span className="label">Осталось времени</span>
          <strong>{timer}</strong>
        </div>
        <div className="duration-control">
          <label className="label" htmlFor="stage-duration">Следующий этап, минут</label>
          <input
            id="stage-duration"
            type="number"
            min="1"
            max="1440"
            step="1"
            value={stageDurationMinutes}
            onChange={(event) => setStageDurationMinutes(Number(event.target.value))}
          />
        </div>
        <button
          className="primary"
          disabled={busy || snapshot.game.status === "completed" || !durationIsValid}
          onClick={() => action({
            type: snapshot.game.status === "waiting" ? "start" : "advance",
            durationSeconds: stageDurationMinutes * 60,
          })}
        >
          {snapshot.game.status === "waiting" ? "Открыть первый этап" : "Завершить этап и перейти дальше"}
        </button>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="team-board">
        {(["red", "blue"] as const).map((color) => {
          const teams = snapshot.teams.filter((team) => team.color === color);
          return (
            <section className={`team-column ${color}`} key={color}>
              <div className="team-column-heading">
                <span>{color === "red" ? "Красные команды" : "Синие команды"}</span>
                <strong>{teams.length}</strong>
              </div>
              {teams.map((team) => {
                const stage = team.currentStageIndex >= 0 ? getScenarioStage(team, team.currentStageIndex) : undefined;
                const selectedChoiceLabel = stage?.choices.find((choice) => choice.id === team.selectedChoiceId)?.label;
                const confirmedStepCount = team.history.filter((decision) => decision.stageIndex === team.currentStageIndex).length;
                return (
                  <article className={`team-card ${team.color}`} key={team.id}>
              <div className="team-head">
                <div>
                  <h2>{team.name}</h2>
                </div>
                <span className={`status ${team.status}`}>{statusLabels[team.status]}</span>
              </div>

              <dl>
                <div className={team.captainTelegramUserId ? "complete" : undefined}><dt>Капитан</dt><dd>{team.captainTelegramUserId ? "Подключён" : "Не подключён"}</dd></div>
                <div className={confirmedStepCount > 0 || team.selectedChoiceId ? "complete" : undefined}>
                  <dt>Решения</dt>
                  <dd>{selectedChoiceLabel ?? (confirmedStepCount > 0 ? `Подтверждено: ${confirmedStepCount}` : "—")}</dd>
                </div>
                <div className={team.currentFileName ? "complete" : undefined}><dt>Файл</dt><dd>{team.currentFileName ?? "—"}</dd></div>
                <div className={team.delivery.status === "sent" ? "complete" : undefined}>
                  <dt>Доставка</dt>
                  <dd title={team.delivery.error}>
                    {team.delivery.status === "failed" ? `Ошибка: ${team.delivery.error ?? "неизвестная ошибка"}` : team.delivery.status === "sent" ? "Доставлено" : "—"}
                  </dd>
                </div>
              </dl>

              {snapshot.game.status === "running" && team.captainChatId && team.status !== "ready" && team.status !== "completed" && (
                <button disabled={busy} onClick={() => action({ type: "resend", teamId: team.id })}>
                  Повторить текущее сообщение
                </button>
              )}

              {stage && stage.choices.length > 0 && team.status !== "ready" && team.status !== "completed" && (
                <div className="override">
                  <span>Решение организатора</span>
                  <div className="choice-row">
                    {stage.choices.map((choice) => (
                      <button key={choice.id} disabled={busy} onClick={() => action({ type: "force", teamId: team.id, choiceId: choice.id })}>
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {team.status === "awaiting-file" && (
                <div className="override">
                  <span>Решение организатора</span>
                  <button disabled={busy} onClick={() => action({ type: "force-complete-without-file", teamId: team.id })}>
                    Завершить этап без файла
                  </button>
                </div>
              )}

              {snapshot.demoMode && team.status !== "ready" && team.status !== "completed" && (
                <div className="demo-tools">
                  <span>Симуляция капитана</span>
                  {team.status === "awaiting-decision" && stage && stage.choices.length > 0 && (
                    <button onClick={() => action({ type: "demo-select", teamId: team.id, choiceId: stage.choices[0].id })}>Выбрать первый вариант</button>
                  )}
                  {team.status === "decision-selected" && <button onClick={() => action({ type: "demo-confirm", teamId: team.id })}>Подтвердить</button>}
                  {team.status === "awaiting-file" && <button onClick={() => action({ type: "demo-file", teamId: team.id })}>Загрузить тестовый Excel</button>}
                </div>
              )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </section>

      <section className="audit-panel">
        <div className="section-heading">
          <div><span className="eyebrow">Контроль</span><h2>Последние события</h2></div>
        </div>
        {snapshot.audit.length === 0 ? <p className="muted">Событий пока нет.</p> : (
          <ul className="audit-list">
            {snapshot.audit.slice(0, 12).map((event) => (
              <li key={event.id}>
                <time>{new Date(event.at).toLocaleTimeString("ru-RU")}</time>
                <span>{event.teamId ?? "Все команды"}</span>
                <strong>{event.action}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

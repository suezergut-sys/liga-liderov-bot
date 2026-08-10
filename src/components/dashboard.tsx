"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameSnapshot, TeamState } from "@/lib/domain/types";
import { getScenarioStage } from "@/lib/scenario";

const statusLabels: Record<TeamState["status"], string> = {
  waiting: "Ожидает старта",
  "awaiting-decision": "Принимает решение",
  "decision-selected": "Подтверждает выбор",
  "awaiting-file": "Загружает файл",
  ready: "Готова",
  completed: "Игра завершена",
};

function formatCountdown(deadlineAt: string | undefined, now: number) {
  if (!deadlineAt) return "10:00";
  const remaining = Math.max(0, new Date(deadlineAt).getTime() - now);
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
  const timer = formatCountdown(snapshot?.game.deadlineAt, effectiveNow);
  const timerExpired = Boolean(snapshot?.game.deadlineAt && new Date(snapshot.game.deadlineAt).getTime() <= effectiveNow);

  const stageLabel = useMemo(() => {
    if (!snapshot || snapshot.game.currentStageIndex < 0) return "Игра не начата";
    if (snapshot.game.status === "completed") return "Прототип завершён";
    return `Этап ${snapshot.game.currentStageIndex + 1} из 2`;
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
        <div>
          <span className="eyebrow">Финансовая деловая игра</span>
          <h1>Лига лидеров</h1>
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
        <button
          className="primary"
          disabled={busy || snapshot.game.status === "completed"}
          onClick={() => action({ type: snapshot.game.status === "waiting" ? "start" : "advance" })}
        >
          {snapshot.game.status === "waiting" ? "Открыть первый этап" : "Завершить этап и перейти дальше"}
        </button>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="team-grid">
        {snapshot.teams.map((team) => {
          const stage = team.currentStageIndex >= 0 ? getScenarioStage(team, team.currentStageIndex) : undefined;
          return (
            <article className={`team-card ${team.color}`} key={team.id}>
              <div className="team-head">
                <div>
                  <span className="team-number">{String(team.number).padStart(2, "0")}</span>
                  <h2>{team.name}</h2>
                </div>
                <span className={`status ${team.status}`}>{statusLabels[team.status]}</span>
              </div>

              <dl>
                <div><dt>Капитан</dt><dd>{team.captainTelegramUserId ? "Подключён" : "Не подключён"}</dd></div>
                <div><dt>Решение</dt><dd>{team.selectedChoiceId ?? "—"}</dd></div>
                <div><dt>Файл</dt><dd>{team.currentFileName ?? "—"}</dd></div>
                <div>
                  <dt>Доставка</dt>
                  <dd title={team.delivery.error}>
                    {team.delivery.status === "failed" ? `Ошибка: ${team.delivery.error ?? "неизвестная ошибка"}` : team.delivery.status === "sent" ? "Доставлено" : "—"}
                  </dd>
                </div>
              </dl>

              {snapshot.game.status === "running" && team.captainChatId && (
                <button disabled={busy} onClick={() => action({ type: "resend", teamId: team.id })}>
                  Повторить отправку этапа
                </button>
              )}

              {stage && team.status !== "ready" && team.status !== "completed" && (
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

              {snapshot.demoMode && stage && team.status !== "ready" && team.status !== "completed" && (
                <div className="demo-tools">
                  <span>Симуляция капитана</span>
                  {team.status === "awaiting-decision" && (
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

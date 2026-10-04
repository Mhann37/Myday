"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { logHabit } from "@/lib/habit-client";
import { useNow } from "@/lib/client";
import { habitValue, maxHabitValue, type Habit } from "@/lib/habits";
import { getWorkspace } from "@/lib/workspace-client";
import { buildDays } from "@/lib/analytics";
interface Timer {
  remaining: number;
  endsAt: number | null;
  date: string;
}
export function HabitTimer({ habit }: { habit: Habit }) {
  const now = useNow(),
    key = `myday-timer:${habit.id}`,
    [timer, setTimer] = useState<Timer | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) setTimer(JSON.parse(raw));
      } catch {}
    };
    const t = setTimeout(read, 0);
    return () => clearTimeout(t);
  }, [key]);
  const time = useSyncExternalStore(
    (cb) => {
      const t = setInterval(cb, 1000);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  );
  if (!now) return null;
  const duration = (habit.timerMinutes ?? 0) * 60;
  if (!duration) return null;
  const remaining = timer
    ? timer.endsAt
      ? Math.max(0, Math.ceil((timer.endsAt - time) / 1000))
      : timer.remaining
    : duration;
  const persist = (next: Timer | null) => {
    setTimer(next);
    setSaved(false);
    try {
      if (next) sessionStorage.setItem(key, JSON.stringify(next));
      else sessionStorage.removeItem(key);
    } catch {
      setError("Keep this tab open; timer storage is unavailable.");
    }
  };
  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          role="timer"
          aria-label={`${habit.name} timer`}
          className="mr-auto font-mono text-sm"
        >
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
        </span>
        {remaining > 0 ? (
          <button
            className="secondary-button text-xs"
            onClick={() =>
              persist({
                remaining,
                endsAt: timer?.endsAt ? null : Date.now() + remaining * 1000,
                date: timer?.date ?? now.today,
              })
            }
          >
            {timer?.endsAt
              ? "Pause"
              : timer
                ? "Resume"
                : `Start ${habit.timerMinutes} min`}
          </button>
        ) : !saved ? (
          <button
            disabled={busy}
            className="primary-button text-xs"
            onClick={async () => {
              setBusy(true);
              try {
                const date = timer?.date ?? now.today,
                  data = getWorkspace();
                const value = data
                  ? (habitValue(
                      habit,
                      date,
                      data.habitData.logs,
                      buildDays(data.entries),
                    ) ?? 0)
                  : 0;
                await logHabit(
                  habit.id,
                  timer?.date ?? now.today,
                  habit.kind === "check"
                    ? 1
                    : Math.min(
                        maxHabitValue(habit),
                        value + (habit.timerMinutes ?? 0),
                      ),
                  "logged",
                  "timer",
                );
                setSaved(true);
                setTimer(null);
                sessionStorage.removeItem(key);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Log session
            {timer?.date && timer.date !== now.today
              ? ` for ${timer.date}`
              : ""}
          </button>
        ) : null}
        {timer && (
          <button
            className="secondary-button text-xs"
            onClick={() => persist(null)}
          >
            Reset
          </button>
        )}
      </div>
      {saved && (
        <p role="status" className="mt-2 text-xs text-good">
          Session recorded.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        Timer survives reload in this tab. Logging a session records{" "}
        {habit.kind === "check"
          ? "done"
          : `another ${habit.timerMinutes} ${habit.unit}`}
        ; a count is added to the existing amount.
      </p>
    </div>
  );
}

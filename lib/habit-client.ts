"use client";

import { useEffect, useSyncExternalStore } from "react";
import { goToLogin } from "./client";
import type { Habit, HabitData, HabitLog } from "./habits";

interface State {
  data: HabitData | null;
  error: string | null;
  pending: ReadonlySet<string>;
}
const EMPTY: State = { data: null, error: null, pending: new Set() };
let state = EMPTY;
let revision = 0;
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
let inflight: Promise<void> | null = null;

async function request(method: string, body?: unknown) {
  const response = await fetch("/api/habits", {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) {
    goToLogin();
    throw new Error("Please sign in again.");
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(json.error ?? "Couldn't save your habits. Try again.");
  return json;
}

export function refreshHabits(): Promise<void> {
  inflight ??= (async () => {
    const version = revision;
    try {
      const data: HabitData = await request("GET");
      if (version === revision && state.pending.size === 0)
        emit({ data, error: null });
    } catch (error) {
      emit({
        error: error instanceof Error ? error.message : "Couldn't load habits.",
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useHabits() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  useEffect(() => {
    void refreshHabits();
    const onVisible = () => {
      if (document.visibilityState === "visible" && state.pending.size === 0)
        void refreshHabits();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return { ...current, refresh: refreshHabits };
}

export async function saveHabit(habit: Habit) {
  const result = (await request("PUT", habit)) as { habit: Habit };
  revision++;
  const data = state.data ?? { habits: [], logs: [] };
  emit({
    data: {
      ...data,
      habits: [...data.habits.filter((h) => h.id !== habit.id), result.habit],
    },
    error: null,
  });
}

export async function logHabit(
  habitId: string,
  date: string,
  value: number | null,
) {
  const key = `${habitId}:${date}`;
  if (state.pending.has(key) || !state.data) return;
  const previous = state.data.logs.find(
    (l) => l.habitId === habitId && l.date === date,
  );
  const patchLog = (log?: HabitLog) => {
    if (!state.data) return;
    const rest = state.data.logs.filter(
      (l) => !(l.habitId === habitId && l.date === date),
    );
    emit({ data: { ...state.data, logs: log ? [...rest, log] : rest } });
  };
  revision++;
  emit({ pending: new Set([...state.pending, key]), error: null });
  patchLog(
    value === null
      ? undefined
      : { habitId, date, value, updatedAt: new Date().toISOString() },
  );
  try {
    await request("PATCH", { habitId, date, value });
  } catch (error) {
    patchLog(previous);
    emit({
      error:
        error instanceof Error ? error.message : "Couldn't save. Please retry.",
    });
    throw error;
  } finally {
    revision++;
    emit({ pending: new Set([...state.pending].filter((p) => p !== key)) });
  }
}

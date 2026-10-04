"use client";
import { useSyncExternalStore } from "react";
import {
  change,
  recordRevision,
  useWorkspace,
  refreshWorkspace,
} from "./workspace-client";
import type { Habit } from "./habits";
import { logicalToday } from "./dates";
let pending: ReadonlySet<string> = new Set();
const subs = new Set<() => void>();
const notify = () => subs.forEach((fn) => fn());
export const refreshHabits = refreshWorkspace;
export function useHabits() {
  const s = useWorkspace();
  const p = useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    () => pending,
    () => pending,
  );
  return {
    data: s.data?.habitData ?? null,
    error: s.error,
    pending: p,
    refresh: refreshWorkspace,
  };
}
export async function saveHabit(
  habit: Habit,
  effectiveFrom = logicalToday(new Date()),
  expected?: string | null,
) {
  const key = `habit:${habit.id}`;
  await change({
    kind: "habit",
    id: crypto.randomUUID(),
    key,
    expected: expected === undefined ? recordRevision(key) : expected,
    data: habit,
    effectiveFrom,
  });
}
export async function logHabit(
  habitId: string,
  date: string,
  value: number | null,
  status: "logged" | "excused" = "logged",
  source = "manual",
) {
  const key = `log:${habitId}:${date}`;
  const row = `${habitId}:${date}`;
  if (pending.has(row)) return;
  pending = new Set([...pending, row]);
  notify();
  try {
    await change({
      kind: "log",
      id: crypto.randomUUID(),
      key,
      expected: recordRevision(key),
      data: { habitId, date, value, status, source },
    });
  } finally {
    pending = new Set([...pending].filter((p) => p !== row));
    notify();
  }
}

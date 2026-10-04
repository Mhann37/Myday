"use client";
import { useSyncExternalStore } from "react";
import { DAY_ROLLOVER_HOUR } from "./config";
import { addDays, localDateString } from "./dates";
import type { Entry, EntryData, Period } from "./schema";
import {
  change,
  recordRevision,
  useWorkspace,
  refreshWorkspace,
  lockOffline,
} from "./workspace-client";
let saveNotice = "";
const notices = new Set<() => void>();
export function goToLogin() {
  lockOffline();
  window.location.replace(new URL("/login", window.location.origin).href);
}
export function setSaveNotice(message: string) {
  saveNotice = message;
  notices.forEach((fn) => fn());
}
export function useSaveNotice() {
  return useSyncExternalStore(
    (fn) => {
      notices.add(fn);
      return () => {
        notices.delete(fn);
      };
    },
    () => saveNotice,
    () => "",
  );
}
export const refreshEntries = refreshWorkspace;
export function useEntries() {
  const s = useWorkspace();
  return {
    entries: s.data?.entries ?? null,
    error: s.error,
    loading: !s.data && !s.error,
    refresh: refreshWorkspace,
  };
}
export async function saveEntry(
  date: string,
  period: Period,
  data: EntryData,
  expected?: string | null,
): Promise<Entry> {
  const key = `entry:${date}:${period}`;
  await change({
    id: crypto.randomUUID(),
    kind: "entry",
    key,
    expected: expected === undefined ? recordRevision(key) : expected,
    data: { date, period, data },
  });
  return { date, period, data, updatedAt: new Date().toISOString() };
}
export async function deleteEntry(
  date: string,
  period: Period,
  expected?: string | null,
) {
  const key = `entry:${date}:${period}`;
  await change({
    id: crypto.randomUUID(),
    kind: "entry",
    key,
    expected: expected === undefined ? recordRevision(key) : expected,
    data: null,
  });
}
// ---------------------------------------------------------------- the clock
// Returns null on the server and during hydration so time-dependent text never
// causes a hydration mismatch.

export interface Now {
  /** the diary day a check-in made now belongs to (rolls over at 4am) */
  today: string;
  /** local hour, 0-23 */
  hour: number;
}

let cachedNow: { key: string; value: Now } | null = null;

function readNow(): Now {
  const d = new Date();
  const hour = d.getHours();
  const calendar = localDateString(d);
  const key = `${calendar}:${hour}`;
  if (!cachedNow || cachedNow.key !== key) {
    cachedNow = {
      key,
      value: {
        today: hour < DAY_ROLLOVER_HOUR ? addDays(calendar, -1) : calendar,
        hour,
      },
    };
  }
  return cachedNow.value;
}

const subscribeClock = (fn: () => void) => {
  const timer = window.setInterval(fn, 30_000);
  const visible = () => {
    if (document.visibilityState === "visible") fn();
  };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("focus", fn);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("focus", fn);
  };
};

export function useNow(): Now | null {
  return useSyncExternalStore(subscribeClock, readNow, () => null);
}

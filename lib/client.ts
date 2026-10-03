"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DAY_ROLLOVER_HOUR } from "./config";
import { addDays, localDateString } from "./dates";
import type { Entry, EntryData, Period } from "./schema";

// ------------------------------------------------------------ entries store
// All entries are small, so the client loads the whole diary once and every
// screen derives what it needs from it. Saves update the cache immediately.

interface State {
  entries: Entry[] | null;
  error: string | null;
}

const EMPTY: State = { entries: null, error: null };
let state: State = EMPTY;
const subscribers = new Set<() => void>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * Leave the signed-in app with a full page load rather than a client navigation. That drops
 * all cached diary data from memory and stops the still-mounted nav links from prefetching
 * pages that now redirect to the login screen.
 */
export function goToLogin() {
  window.location.replace(new URL("/login", window.location.origin).href);
}

let inflight: Promise<void> | null = null;

export function refreshEntries(): Promise<void> {
  inflight ??= (async () => {
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      if (res.status === 401) {
        goToLogin();
        return;
      }
      const json = (await res.json()) as { entries?: Entry[]; error?: string };
      if (!res.ok || !json.entries) throw new Error(json.error ?? "Couldn't load your diary");
      emit({ entries: json.entries, error: null });
    } catch (err) {
      emit({ error: err instanceof Error ? err.message : "Couldn't load your diary" });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useEntries() {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    void refreshEntries();
  }, []);
  return { entries: s.entries, error: s.error, loading: s.entries === null && s.error === null, refresh: refreshEntries };
}

function upsertLocal(entry: Entry) {
  const rest = (state.entries ?? []).filter((e) => !(e.date === entry.date && e.period === entry.period));
  emit({ entries: [...rest, entry].sort((a, b) => (a.date === b.date ? (a.period < b.period ? 1 : -1) : a.date < b.date ? -1 : 1)) });
}

export async function saveEntry(date: string, period: Period, data: EntryData): Promise<Entry> {
  const res = await fetch("/api/entries", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, period, data }),
  });
  if (res.status === 401) {
    goToLogin();
    throw new Error("Signed out");
  }
  const json = (await res.json()) as { entry?: Entry; error?: string };
  if (!res.ok || !json.entry) throw new Error(json.error ?? "Couldn't save");
  upsertLocal(json.entry);
  return json.entry;
}

export async function deleteEntry(date: string, period: Period): Promise<void> {
  const res = await fetch(`/api/entries?date=${date}&period=${period}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Couldn't delete");
  emit({ entries: (state.entries ?? []).filter((e) => !(e.date === date && e.period === period)) });
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
    cachedNow = { key, value: { today: hour < DAY_ROLLOVER_HOUR ? addDays(calendar, -1) : calendar, hour } };
  }
  return cachedNow.value;
}

const noopSubscribe = () => () => {};

export function useNow(): Now | null {
  return useSyncExternalStore(noopSubscribe, readNow, () => null);
}

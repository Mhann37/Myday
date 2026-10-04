"use client";
import { useEffect, useSyncExternalStore } from "react";
import * as vault from "../public/vault.js";
import type { Mutation, Workspace } from "./workspace";
import { DEFAULT_PREFERENCES, type Preferences } from "./preferences";
import type { Experiment } from "./experiments";
import type { Entry } from "./schema";
import { preserveGoals } from "./habits";

export interface PendingChange {
  mutation: Mutation;
  error?: string;
}
interface Payload {
  snapshot: Workspace;
  queue: PendingChange[];
}
interface State {
  data: Workspace | null;
  error: string | null;
  queue: PendingChange[];
  enabled: boolean;
  unlocked: boolean;
  syncing: boolean;
}
const EMPTY: State = {
  data: null,
  error: null,
  queue: [],
  enabled: false,
  unlocked: false,
  syncing: false,
};
let state = EMPTY,
  inflight: Promise<void> | null = null,
  syncing: Promise<void> | null = null,
  revision = 0;
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
export const recordRevision = (key: string) =>
  state.data?.records.find((r) => r.key === key)?.revision ?? null;
export const getWorkspace = () => state.data;
export const getPreferences = (): Preferences =>
  (state.data?.records.find((r) => r.key === "preferences")
    ?.data as Preferences) ?? DEFAULT_PREFERENCES;
export function optimistic(data: Workspace, m: Mutation): Workspace {
  const next = structuredClone(data);
  let stored: unknown = m.data;
  if (m.kind === "entry") {
    const [date, period] = m.key.slice(6).split(":");
    next.entries = next.entries.filter(
      (e) => !(e.date === date && e.period === period),
    );
    if (m.data)
      next.entries.push({
        ...m.data,
        updatedAt: new Date().toISOString(),
      } as Entry);
    next.entries.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || b.period.localeCompare(a.period),
    );
  } else if (m.kind === "habit") {
    stored = preserveGoals(
      next.habitData.habits.find((h) => h.id === m.data.id),
      m.data,
      m.effectiveFrom,
    );
    next.habitData.habits = [
      ...next.habitData.habits.filter((h) => h.id !== m.data.id),
      stored as typeof m.data,
    ];
  } else if (m.kind === "log") {
    const l = m.data;
    next.habitData.logs = next.habitData.logs.filter(
      (x) => !(x.habitId === l.habitId && x.date === l.date),
    );
    if (l.value !== null || l.status === "excused")
      next.habitData.logs.push({
        ...l,
        value: l.value ?? 0,
        updatedAt: new Date().toISOString(),
      });
  }
  next.records = [
    ...next.records.filter((r) => r.key !== m.key),
    { key: m.key, data: stored, revision: m.id },
  ];
  return next;
}
async function remote(): Promise<Workspace> {
  const res = await fetch("/api/workspace", { cache: "no-store" });
  if (res.status === 401)
    throw new Error(
      "Please sign in again. Unsynced data is kept on this device.",
    );
  if (!res.ok) throw new Error("Could not load your data. Try again.");
  return res.json();
}
export async function refreshWorkspace() {
  inflight ??= (async () => {
    const version = revision;
    try {
      const enabled = !!(await vault.metadata());
      if (version !== revision) return;
      emit({ enabled, unlocked: vault.isUnlocked() });
      if (enabled && vault.isUnlocked()) {
        const local = (await vault.read()) as Payload;
        if (!state.data || local.queue.length)
          emit({ data: local.snapshot, queue: local.queue });
      }
      if (state.queue.length) {
        if (navigator.onLine) await syncWorkspace();
        return;
      }
      const data = await remote();
      if (version === revision && !state.queue.length) {
        if (enabled && vault.isUnlocked())
          await vault.update((p: Payload) =>
            p.queue.length ? p : { ...p, snapshot: data },
          );
        emit({ data, error: null });
      }
    } catch (e) {
      emit({ error: e instanceof Error ? e.message : "Could not load." });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
async function send(m: Mutation) {
  const res = await fetch("/api/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(
      body.error ?? "Could not save. Try again.",
    ) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return body as { revision: string; data: unknown };
}
export async function change(m: Mutation) {
  if (!state.data) throw new Error("Wait for your data to load.");
  if (state.enabled && !vault.isUnlocked())
    throw new Error("Unlock device storage using the banner before saving.");
  revision++;
  if (state.enabled) {
    const local = (await vault.update((p: Payload) => ({
      ...p,
      snapshot: optimistic(p.snapshot, m),
      queue: [...p.queue, { mutation: m }],
    }))) as Payload;
    emit({ data: local.snapshot, queue: local.queue, error: null });
    if (navigator.onLine) await syncWorkspace();
    return;
  }
  const result = await send(m);
  const next = optimistic(state.data, m);
  next.records = next.records.map((r) =>
    r.key === m.key ? { ...r, data: result.data } : r,
  );
  // The server may have added the historical goal definition.
  if (m.kind === "habit")
    next.habitData.habits = next.habitData.habits.map((h) =>
      h.id === m.data.id ? (result.data as typeof h) : h,
    );
  emit({ data: next, error: null });
}
export function syncWorkspace() {
  syncing ??= (async () => {
    if (!vault.isUnlocked() || !navigator.onLine) return;
    emit({ syncing: true });
    try {
      await navigator.locks.request("myday-sync", async () => {
        let p = (await vault.read()) as Payload;
        while (p.queue.length) {
          const item = p.queue[0];
          if (item.error) break;
          try {
            await send(item.mutation);
          } catch (e) {
            const status = (e as { status?: number }).status;
            if (status === 409 || status === 400 || status === 401) {
              p = (await vault.update((q: Payload) => ({
                ...q,
                queue: q.queue.map((x) =>
                  x.mutation.id === item.mutation.id
                    ? { ...x, error: (e as Error).message }
                    : x,
                ),
              }))) as Payload;
            }
            emit({ error: (e as Error).message, queue: p.queue });
            return;
          }
          p = (await vault.update((q: Payload) => ({
            ...q,
            queue: q.queue.filter((x) => x.mutation.id !== item.mutation.id),
          }))) as Payload;
          emit({ queue: p.queue });
        }
        if (!p.queue.length) {
          const data = await remote();
          p = (await vault.update((q: Payload) =>
            q.queue.length ? q : { ...q, snapshot: data },
          )) as Payload;
          emit({ data: p.snapshot, queue: p.queue, error: null });
        }
      });
    } catch (e) {
      emit({ error: (e as Error).message });
    } finally {
      emit({ syncing: false });
      syncing = null;
    }
  })();
  return syncing;
}
export async function resolveChange(keepDevice: boolean) {
  const p = (await vault.read()) as Payload,
    item = p.queue[0];
  if (!item) return;
  const server = await remote();
  const same = p.queue.filter((x) => x.mutation.key === item.mutation.key);
  const latest = same.at(-1)!;
  const mutation = {
    ...latest.mutation,
    id: crypto.randomUUID(),
    expected:
      server.records.find((r) => r.key === item.mutation.key)?.revision ?? null,
  } as Mutation;
  const queue = p.queue.filter((x) => x.mutation.key !== item.mutation.key);
  if (keepDevice) queue.unshift({ mutation });
  const snapshot = queue.reduce((s, x) => optimistic(s, x.mutation), server);
  const next = (await vault.update((p: Payload) => ({
    ...p,
    snapshot,
    queue,
  }))) as Payload;
  emit({ data: next.snapshot, queue: next.queue, error: null });
  revision++;
  await syncWorkspace();
}
export async function enableOffline(passphrase: string) {
  if (!state.data) throw new Error("Wait for your data to load.");
  if (!navigator.locks)
    throw new Error(
      "This browser does not support dependable offline storage.",
    );
  await vault.configure(passphrase, { snapshot: state.data, queue: [] });
  localStorage.setItem("myday-offline-enabled", "true");
  for (const k of Object.keys(localStorage))
    if (k.startsWith("myday:draft:")) localStorage.removeItem(k);
  emit({ enabled: true, unlocked: true });
}
export async function unlockOffline(passphrase: string) {
  const p = (await vault.unlock(passphrase)) as Payload;
  revision++;
  emit({
    data: p.snapshot,
    queue: p.queue,
    enabled: true,
    unlocked: true,
    error: null,
  });
  await syncWorkspace();
  await refreshWorkspace();
}
export async function disableOffline() {
  if (state.queue.length)
    throw new Error(
      "Sync or resolve your device changes before removing offline storage.",
    );
  revision++;
  if (syncing) await syncing;
  await vault.wipe();
  localStorage.removeItem("myday-offline-enabled");
  emit({ enabled: false, unlocked: false });
}
export function lockOffline() {
  vault.lock();
  emit({ unlocked: false });
}
export function useWorkspace() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  useEffect(() => {
    void refreshWorkspace();
    const returned = () => {
      if (document.visibilityState === "visible") void refreshWorkspace();
    };
    const online = () => {
      void syncWorkspace().then(refreshWorkspace);
    };
    document.addEventListener("visibilitychange", returned);
    window.addEventListener("online", online);
    const timer = window.setInterval(() => {
      if (state.queue.length && navigator.onLine) void syncWorkspace();
    }, 15000);
    return () => {
      document.removeEventListener("visibilitychange", returned);
      window.removeEventListener("online", online);
      window.clearInterval(timer);
    };
  }, []);
  return {
    ...current,
    preferences: getPreferences(),
    experiments: (current.data?.records
      .filter((r) => r.key.startsWith("experiment:"))
      .map((r) => r.data) ?? []) as Experiment[],
    refresh: refreshWorkspace,
  };
}

export async function saveDeviceDraft(
  name: string,
  data: unknown,
  expected: string | null,
) {
  if (!state.enabled || !vault.isUnlocked())
    throw new Error("Unlock device storage to keep this draft.");
  await vault.update((p: Payload & { drafts?: Record<string, unknown> }) => ({
    ...p,
    drafts: {
      ...(p.drafts ?? {}),
      [name]: data === null ? null : { data, expected },
    },
  }));
}
export async function readDeviceDraft(name: string) {
  if (!vault.isUnlocked()) return null;
  const p = (await vault.read()) as Payload & {
    drafts?: Record<string, { data: unknown; expected: string | null } | null>;
  };
  return p.drafts?.[name] ?? null;
}

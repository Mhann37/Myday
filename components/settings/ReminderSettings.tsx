"use client";
import { useState, useEffect, useCallback } from "react";
import { useHabits } from "@/lib/habit-client";
import type { ReminderSettings as Settings } from "@/lib/reminders";
import { Card } from "../ui";
export function ReminderSettings() {
  const { data } = useHabits(),
    [id, setId] = useState(""),
    [draft, setDraft] = useState<Settings | null>(null),
    [revision, setRevision] = useState<string | null>(null),
    [publicKey, setPublicKey] = useState(""),
    [configured, setConfigured] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [deliveries, setDeliveries] = useState<{ state: string; at: string }[]>([]);
  const load = useCallback(async (current: string) => {
    try {
      const r = await fetch(`/api/reminders?id=${current}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("Could not load reminder settings.");
      const json = await r.json();
      setPublicKey(json.publicKey);
      setConfigured(json.schedulerConfigured);
      setDraft(json.settings?.data ?? null);
      setRevision(json.settings?.revision ?? null);
      setDeliveries(json.deliveries ?? []);
      setId(current);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let current = localStorage.getItem("myday-reminder-device");
    if (!current) {
      current = crypto.randomUUID();
      localStorage.setItem("myday-reminder-device", current);
    }
    void Promise.resolve().then(() => load(current));
  }, [load]);
  async function connect() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error(
        "This browser cannot receive push reminders. On iPhone, install My Day on the Home Screen and open it there.",
      );
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      throw new Error(
        "Notifications are blocked. Enable them in your browser or device settings.",
      );
    const reg = await navigator.serviceWorker.ready,
      existing = await reg.pushManager.getSubscription();
    const bytes = Uint8Array.from(
      atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }));
    const settings: Settings = {
      id,
      enabled: configured,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      quietStart: "22:00",
      quietEnd: "07:00",
      subscription: sub.toJSON() as Settings["subscription"],
      reminders: [
        {
          id: crypto.randomUUID(),
          label: "A moment for your morning check-in",
          time: "08:00",
          habitId: null,
          period: "morning",
        },
        {
          id: crypto.randomUUID(),
          label: "Notice your day",
          time: "20:30",
          habitId: null,
          period: "night",
        },
      ],
    };
    await save(settings);
    setNotice("Device connected. Send a test to check delivery.");
  }
  async function save(settings = draft) {
    if (!settings) return;
    const r = await fetch("/api/reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, expected: revision }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    await load(id);
  }
  const run = async (fn: () => Promise<unknown>, message = "") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">A timely nudge</h2>
      <p className="mt-2 text-sm text-ink-2">
        Optional reminders for the habits and check-ins you choose. Completed
        actions and quiet hours are respected.
      </p>
      {!configured && (
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
          Scheduled delivery is awaiting server setup. You can connect this
          device and test push delivery now. Calendar reminders below work
          independently.
        </p>
      )}
      {!draft ? (
        <button
          disabled={busy || !publicKey}
          className="primary-button mt-4"
          onClick={() => void run(connect)}
        >
          Connect notifications
        </button>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => save(), "Reminder settings saved.");
          }}
        >
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              disabled={!configured}
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            Scheduled reminders
          </label>
          <label className="block text-sm">
            Timezone
            <input
              className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="secondary-button text-sm"
            onClick={() =>
              setDraft({
                ...draft,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
            }
          >
            Use this device’s timezone
          </button>
          <div className="grid grid-cols-2 gap-3">
            {(["quietStart", "quietEnd"] as const).map((k) => (
              <label className="text-sm" key={k}>
                {k === "quietStart" ? "Quiet hours start" : "Quiet hours end"}
                <input
                  type="time"
                  required
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          {draft.reminders.map((r, i) => (
            <div
              key={r.id}
              className="space-y-2 rounded-xl border border-line p-3"
            >
              <label className="block text-sm">
                Reminder name
                <input
                  aria-label={`Reminder ${i + 1} name`}
                  maxLength={60}
                  required
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
                  value={r.label}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      reminders: draft.reminders.map((x) =>
                        x.id === r.id ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label={`Reminder ${i + 1} time`}
                  type="time"
                  required
                  className="h-11 rounded-xl border border-line bg-surface px-3"
                  value={r.time}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      reminders: draft.reminders.map((x) =>
                        x.id === r.id ? { ...x, time: e.target.value } : x,
                      ),
                    })
                  }
                />
                <select
                  aria-label={`Reminder ${i + 1} action`}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2"
                  value={r.habitId ?? r.period ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      reminders: draft.reminders.map((x) =>
                        x.id === r.id
                          ? {
                              ...x,
                              habitId: ["morning", "night", ""].includes(
                                e.target.value,
                              )
                                ? null
                                : e.target.value,
                              period: ["morning", "night"].includes(
                                e.target.value,
                              )
                                ? (e.target.value as "morning" | "night")
                                : null,
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option value="">Open habits</option>
                  <option value="morning">Morning check-in</option>
                  <option value="night">Night check-in</option>
                  {data?.habits
                    .filter((h) => !h.archived)
                    .map((h) => (
                      <option value={h.id} key={h.id}>
                        {h.name}
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="button"
                className="secondary-button text-sm"
                onClick={() =>
                  setDraft({
                    ...draft,
                    reminders: draft.reminders.filter((x) => x.id !== r.id),
                  })
                }
              >
                Remove reminder
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={draft.reminders.length >= 20}
            onClick={() =>
              setDraft({
                ...draft,
                reminders: [
                  ...draft.reminders,
                  {
                    id: crypto.randomUUID(),
                    label: "A small action for today",
                    time: "12:30",
                    habitId: null,
                    period: null,
                  },
                ],
              })
            }
          >
            Add reminder
          </button>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className="primary-button">
              Save reminders
            </button>
            <button
              disabled={busy}
              type="button"
              className="secondary-button"
              onClick={() =>
                void run(async () => {
                  const r = await fetch("/api/reminders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id }),
                  });
                  if (!r.ok)
                    throw new Error(
                      "Test delivery failed. Check device permissions.",
                    );
                }, "Push service accepted the test. Check your device for the notification.")
              }
            >
              Send test
            </button>
          </div>
          {deliveries.length > 0 && (
            <details className="text-xs text-muted">
              <summary>Recent delivery status</summary>
              {deliveries.map((d, i) => (
                <p key={i}>
                  {new Date(d.at).toLocaleString()} ·{" "}
                  {d.state === "accepted"
                    ? "Accepted by push service"
                    : d.state === "displayed"
                      ? "Displayed on device"
                      : d.state}
                </p>
              ))}
            </details>
          )}
        </form>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-semibold">Calendar reminders</p>
        <p className="mt-1 text-xs text-ink-2">
          Add a daily reminder to your calendar. Calendar alerts continue after
          an action is complete; push reminders can suppress completed actions.
        </p>
        <div className="mt-2 flex gap-2">
          <a
            className="secondary-button text-sm"
            href="/api/calendar?period=morning"
            download
          >
            Morning · 8am
          </a>
          <a
            className="secondary-button text-sm"
            href="/api/calendar?period=night"
            download
          >
            Night · 8:30pm
          </a>
        </div>
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm text-good">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </Card>
  );
}

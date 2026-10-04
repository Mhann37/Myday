"use client";
import { useEffect, useState, useCallback } from "react";
import { useHabits } from "@/lib/habit-client";
import { Card } from "../ui";
interface Source {
  id: string;
  name: string;
  enabled: boolean;
  lastImportedAt?: string;
}
export function ConnectedSources() {
  const { data } = useHabits(),
    [sources, setSources] = useState<Source[]>([]),
    [name, setName] = useState(""),
    [habits, setHabits] = useState<string[]>([]),
    [access, setAccess] = useState<{ token: string; endpoint: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/integrations");
      if (!r.ok) throw new Error("Could not load connected sources.");
      setSources((await r.json()).sources);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">
        Connected measurement sources
      </h2>
      <p className="mt-2 text-sm text-ink-2">
        A source can send readings for the habits you choose. It cannot read
        your diary or replace a manual correction. A device automation or export
        bridge is needed to send health data.
      </p>
      {sources
        .filter((s) => s.enabled)
        .map((s) => (
          <div
            key={s.id}
            className="mt-3 flex items-center gap-3 rounded-xl border border-line p-3"
          >
            <div className="flex-1">
              <p className="font-semibold">{s.name}</p>
              <p className="text-xs text-muted">
                {s.lastImportedAt
                  ? `Last import ${new Date(s.lastImportedAt).toLocaleString()}`
                  : "Waiting for first reading"}
              </p>
            </div>
            <button
              className="secondary-button text-sm"
              disabled={busy}
              onClick={async () => {
                try {
                  const r = await fetch("/api/integrations", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: s.id }),
                  });
                  if (!r.ok) throw new Error("Could not disconnect.");
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Disconnect
            </button>
          </div>
        ))}
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Connect a source
        </summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/integrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, habitIds: habits }),
              });
              const json = await r.json();
              if (!r.ok) throw new Error(json.error);
              setAccess(json);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm font-semibold">
            Source name
            <input
              aria-label="Source name"
              required
              maxLength={60}
              className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
              placeholder="e.g. Watch automation"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">
              Allow readings for
            </legend>
            {data?.habits
              .filter((h) => !h.archived)
              .map((h) => (
                <label
                  key={h.id}
                  className="mt-1 flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={habits.includes(h.id)}
                    onChange={(e) =>
                      setHabits(
                        e.target.checked
                          ? [...habits, h.id]
                          : habits.filter((id) => id !== h.id),
                      )
                    }
                  />
                  {h.name}
                </label>
              ))}
          </fieldset>
          <button disabled={busy || !habits.length} className="primary-button">
            Create source access
          </button>
        </form>
      </details>
      {access && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <p className="text-sm font-semibold">Set up your source</p>
          <p className="mt-1 text-xs text-ink-2">
            Copy this access key into your automation. It is shown once and can
            be revoked using Disconnect.
          </p>
          <label className="mt-3 block text-xs">
            Access key
            <input
              readOnly
              type="password"
              aria-label="Source access key"
              className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
              value={access.token}
            />
          </label>
          <button
            className="secondary-button mt-2 text-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(access.token);
              } catch {
                setError("Copy the access key from the field.");
              }
            }}
          >
            Copy access key
          </button>
          <details className="mt-3 text-xs">
            <summary className="min-h-11 cursor-pointer">
              Connection details
            </summary>
            <p className="break-all">POST {access.endpoint}</p>
            <p>Authorization: Bearer your access key</p>
            <p className="mt-2">
              Send JSON with daily readings, using the habit’s displayed unit:
            </p>
            <pre className="mt-2 overflow-auto rounded-xl bg-surface p-3">
              {JSON.stringify(
                {
                  readings: habits.map((habitId) => ({
                    habitId,
                    date: "2026-10-04",
                    value: 1,
                  })),
                },
                null,
                2,
              )}
            </pre>
          </details>
          <button
            className="secondary-button mt-3 text-sm"
            onClick={() => setAccess(null)}
          >
            Done
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </Card>
  );
}

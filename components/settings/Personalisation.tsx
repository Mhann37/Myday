"use client";
import { useState } from "react";
import {
  useWorkspace,
  change,
  recordRevision,
  enableOffline,
  disableOffline,
} from "@/lib/workspace-client";
import { QUICK_FIELDS, OUTCOMES, type Preferences } from "@/lib/preferences";
import { KIDS } from "@/lib/config";
import { Card } from "../ui";
export function Personalisation() {
  const s = useWorkspace();
  if (!s.data) return null;
  return (
    <PreferenceForm
      key={
        s.data.records.find((r) => r.key === "preferences")?.revision ??
        "default"
      }
      initial={s.preferences}
    />
  );
}
function PreferenceForm({ initial }: { initial: Preferences }) {
  const s = useWorkspace(),
    [draft, setDraft] = useState(initial),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [pass, setPass] = useState("");
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      setNotice(message);
      setPass("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card>
        <h2 className="font-display text-xl font-semibold">
          Make My Day yours
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          Keep the questions that help you make decisions. Your full diary stays
          available.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                change({
                  kind: "preferences",
                  key: "preferences",
                  id: crypto.randomUUID(),
                  expected: recordRevision("preferences"),
                  data: draft,
                }),
              "Preferences saved.",
            );
          }}
          className="mt-4 space-y-5"
        >
          {(["morning", "night"] as const).map((period) => (
            <fieldset key={period}>
              <legend className="mb-2 font-semibold">
                {period === "morning" ? "Morning" : "Night"} quick check-in
              </legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(QUICK_FIELDS)
                  .filter(([id]) =>
                    period === "night"
                      ? !id.startsWith("sleep")
                      : ![
                          "lifted",
                          "cardio",
                          "water",
                          "alcohol",
                          "outdoor",
                        ].includes(id),
                  )
                  .map(([id, label]) => (
                    <label
                      key={id}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={draft[period].includes(id as never)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [period]: e.target.checked
                              ? [...draft[period], id]
                              : draft[period].filter((x) => x !== id),
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className="mb-2 font-semibold">
              Outcomes you care about
            </legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(OUTCOMES).map(([id, o]) => (
                <label
                  key={id}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draft.outcomes.includes(id as never)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        outcomes: e.target.checked
                          ? [...draft.outcomes, id as keyof typeof OUTCOMES]
                          : draft.outcomes.filter((x) => x !== id),
                      })
                    }
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.hideCompleted}
              onChange={(e) =>
                setDraft({ ...draft, hideCompleted: e.target.checked })
              }
            />
            Collapse completed habits on Today
          </label>
          <label className="block text-sm font-semibold">
            Partner label
            <input
              maxLength={32}
              required
              className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3"
              value={draft.partnerName}
              onChange={(e) =>
                setDraft({ ...draft, partnerName: e.target.value })
              }
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              Family labels
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {KIDS.map((k) => (
                <label key={k.key} className="text-xs text-ink-2">
                  {k.name}
                  <input
                    aria-label={`Name for ${k.name}`}
                    required
                    maxLength={32}
                    className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
                    value={draft.childNames[k.key] ?? k.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        childNames: {
                          ...draft.childNames,
                          [k.key]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={busy} className="primary-button w-full">
            Save preferences
          </button>
        </form>
      </Card>
      <Card>
        <h2 className="font-display text-xl font-semibold">
          Offline on this device
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          Keep an encrypted copy so habits and quick check-ins work without a
          connection. Unlock it after each fresh launch with a separate device
          passphrase.
        </p>
        {s.enabled ? (
          <>
            <p className="mt-3 text-sm text-good">
              Device storage enabled · {s.unlocked ? "unlocked" : "locked"}
            </p>
            <button
              className="secondary-button mt-3"
              disabled={busy || !s.unlocked || s.queue.length > 0}
              onClick={() => void run(disableOffline, "Device copy removed.")}
            >
              Remove device copy
            </button>
            <p className="mt-2 text-xs text-muted">
              Sync all changes before removing the copy. Online records are
              kept.
            </p>
          </>
        ) : (
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => enableOffline(pass), "Offline storage enabled.");
            }}
          >
            <label className="block text-sm font-semibold">
              Device passphrase
              <input
                aria-label="New device passphrase"
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted">
              Use at least 8 characters and keep it safe. An online backup
              cannot recover unsynced changes if this passphrase is lost or the
              browser removes its storage.
            </p>
            <button disabled={busy} className="primary-button">
              Enable offline storage
            </button>
          </form>
        )}
      </Card>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-good">
          {notice}
        </p>
      )}
    </>
  );
}

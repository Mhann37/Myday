"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { recordRevision } from "@/lib/workspace-client";
import { addDays } from "@/lib/dates";
import { saveHabit } from "@/lib/habit-client";
import {
  habitSchema,
  maxHabitValue,
  SOURCES,
  starterHabit,
  WEEKDAYS,
  type Habit,
} from "@/lib/habits";
import { cn } from "../ui";

const input =
  "mt-1.5 h-12 w-full rounded-xl border border-line bg-surface px-3 text-ink";

export function HabitEditor({
  habit,
  today,
  onClose,
  onArchive,
}: {
  habit?: Habit;
  today: string;
  onClose: () => void;
  onArchive?: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(
    () => habit ?? starterHabit("custom", today),
  );
  const baseRevision = useRef(
    habit ? recordRevision(`habit:${habit.id}`) : null,
  );
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [pauseFrom, setPauseFrom] = useState(today);
  const [pauseTo, setPauseTo] = useState(addDays(today, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const patch = (data: Partial<Habit>) =>
    setDraft((prev) => ({ ...prev, ...data }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const result = habitSchema.safeParse(draft);
    if (!result.success) {
      setError(
        "Add a name, a positive target and increment, and at least one scheduled day.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveHabit(result.data, effectiveFrom, baseRevision.current);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save. Try again.",
      );
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="habit-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="modal w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-line bg-bg p-0 text-ink shadow-2xl"
    >
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="eyebrow">MAKE IT YOURS</p>
            <h2
              id="habit-editor-title"
              className="font-display mt-1 text-2xl font-semibold"
            >
              {habit ? "Edit habit" : "Start something good"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close habit editor"
            disabled={busy}
            onClick={onClose}
            className="icon-button"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          {!habit && (
            <label className="block text-sm font-semibold">
              Track
              <select
                className={input}
                value={draft.source}
                onChange={(e) => {
                  const template = starterHabit(
                    e.target.value as Habit["source"],
                    today,
                  );
                  patch({ ...template, id: draft.id });
                }}
              >
                {SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm font-semibold">
            Habit name
            <input
              autoFocus
              required
              maxLength={60}
              className={input}
              placeholder="e.g. Read before bed"
              value={draft.name === "New habit" ? "" : draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label className="block text-sm font-semibold">
            Make it easy to start{" "}
            <span className="font-normal text-muted">(optional)</span>
            <input
              maxLength={160}
              className={input}
              placeholder="After dinner, read one page on the couch"
              value={draft.cue}
              onChange={(e) => patch({ cue: e.target.value })}
            />
          </label>
          {!habit && draft.source === "custom" && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                How to log it
              </legend>
              <div className="flex gap-2">
                {(["check", "count"] as const).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    aria-pressed={draft.kind === kind}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-3 text-sm font-semibold",
                      draft.kind === kind
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line",
                    )}
                    onClick={() =>
                      patch({ kind, target: 1, step: 1, unit: "" })
                    }
                  >
                    {kind === "check" ? "Done / not done" : "Track a number"}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {draft.kind === "count" && (
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm font-semibold">
                Daily target
                <input
                  className={input}
                  required
                  type="number"
                  min="0.01"
                  max={maxHabitValue(draft)}
                  step="any"
                  value={draft.target || ""}
                  onChange={(e) => patch({ target: Number(e.target.value) })}
                />
              </label>
              <label className="text-sm font-semibold">
                Unit
                <input
                  className={input}
                  maxLength={24}
                  disabled={!!habit}
                  placeholder="minutes"
                  value={draft.unit}
                  onChange={(e) => patch({ unit: e.target.value })}
                />
              </label>
              <label className="text-sm font-semibold">
                Quick add
                <input
                  className={input}
                  required
                  type="number"
                  min="0.01"
                  max={maxHabitValue(draft)}
                  step="any"
                  value={draft.step || ""}
                  onChange={(e) => patch({ step: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">
              Place in your day
              <select
                className={input}
                value={draft.routine ?? "anytime"}
                onChange={(e) =>
                  patch({ routine: e.target.value as Habit["routine"] })
                }
              >
                {["morning", "day", "evening", "anytime"].map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Display order
              <input
                className={input}
                type="number"
                min={0}
                max={1000}
                value={draft.order ?? 0}
                onChange={(e) => patch({ order: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.pinned ?? false}
              onChange={(e) => patch({ pinned: e.target.checked })}
            />
            Pin at the top of Today
          </label>
          {(draft.kind === "check" ||
            (draft.source === "custom" &&
              ["min", "minutes"].includes(draft.unit.toLowerCase()))) && (
            <label className="block text-sm font-semibold">
              Session timer (minutes, 0 to disable)
              <input
                className={input}
                type="number"
                min={0}
                max={180}
                value={draft.timerMinutes ?? 0}
                onChange={(e) =>
                  patch({ timerMinutes: Number(e.target.value) })
                }
              />
            </label>
          )}
          <label className="block text-sm font-semibold">
            Frequency
            <select
              className={input}
              value={draft.schedule}
              onChange={(e) =>
                patch({ schedule: e.target.value as Habit["schedule"] })
              }
            >
              <option value="daily">On specific days</option>
              <option value="weekly">Flexible weekly goal</option>
            </select>
          </label>
          {draft.schedule === "weekly" ? (
            <label className="block text-sm font-semibold">
              Days per week
              <select
                className={input}
                value={draft.weeklyTarget}
                onChange={(e) =>
                  patch({ weeklyTarget: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} day{n !== 1 ? "s" : ""} per week
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs font-normal text-muted">
                Any days you choose. Rest days are part of the plan.
              </span>
            </label>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                Scheduled days
              </legend>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day, i) => (
                  <button
                    type="button"
                    key={day}
                    aria-pressed={draft.days.includes(i)}
                    className={cn(
                      "min-h-11 rounded-lg text-xs font-semibold",
                      draft.days.includes(i)
                        ? "bg-accent text-on-accent"
                        : "bg-surface-2 text-ink-2",
                    )}
                    onClick={() =>
                      patch({
                        days: draft.days.includes(i)
                          ? draft.days.filter((d) => d !== i)
                          : [...draft.days, i],
                      })
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {draft.source !== "custom" && (
            <p className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
              Existing check-ins also contribute to this goal. Quick logs take
              precedence for a day; clearing a quick log restores the diary
              value.
            </p>
          )}
          {habit && (
            <>
              <label className="block text-sm font-semibold">
                Goal changes start
                <input
                  type="date"
                  className={input}
                  min={today}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted">
                Earlier targets and schedules stay in your history. This date
                applies to target and frequency changes.
              </p>
              <details className="rounded-xl border border-line p-3">
                <summary className="min-h-11 cursor-pointer text-sm font-semibold">
                  Pause for illness, travel or rest
                </summary>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    From
                    <input
                      type="date"
                      className={input}
                      min={today}
                      value={pauseFrom}
                      onChange={(e) => setPauseFrom(e.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    Through
                    <input
                      type="date"
                      className={input}
                      min={pauseFrom}
                      value={pauseTo}
                      onChange={(e) => setPauseTo(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="secondary-button mt-3 text-sm"
                  onClick={() => {
                    if (pauseTo < pauseFrom) {
                      setError("Pause end must follow its start.");
                      return;
                    }
                    patch({
                      pauses: [
                        ...(draft.pauses ?? []),
                        {
                          from: pauseFrom,
                          to: pauseTo,
                          reason: "Planned pause",
                        },
                      ],
                    });
                  }}
                >
                  Add pause
                </button>
                {draft.pauses?.map((p, i) => (
                  <div className="mt-2 flex items-center gap-2 text-xs" key={i}>
                    <span className="flex-1">
                      {p.from} – {p.to}
                    </span>
                    <button
                      type="button"
                      className="secondary-button text-xs"
                      onClick={() =>
                        patch({
                          pauses: draft.pauses?.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </details>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="primary-button w-full"
          >
            {busy && <Loader2 size={18} className="animate-spin" />}
            {busy ? "Saving…" : habit ? "Save changes" : "Create habit"}
          </button>
          {onArchive && (
            <div className="text-center">
              {confirmArchive ? (
                <>
                  <p className="mb-2 text-sm text-ink-2">
                    Archive this habit? Your history will be kept.
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="secondary-button"
                      onClick={() => setConfirmArchive(false)}
                    >
                      Keep habit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="secondary-button text-bad"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onArchive();
                        } catch {
                          setError("Couldn't archive. Try again.");
                          setBusy(false);
                        }
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-11 text-sm text-muted"
                  onClick={() => setConfirmArchive(true)}
                >
                  Archive habit
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </dialog>
  );
}

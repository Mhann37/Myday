"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flame,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Sprout,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildDays, type DayRecord } from "@/lib/analytics";
import { useEntries, useNow } from "@/lib/client";
import {
  addDays,
  formatDayMonth,
  formatLong,
  formatWeekday,
} from "@/lib/dates";
import { logHabit, saveHabit, useHabits } from "@/lib/habit-client";
import {
  habitStreak,
  habitValue,
  habitWeek,
  maxHabitValue,
  scheduled,
  starterHabit,
  weekStart,
  type Habit,
  type HabitLog,
} from "@/lib/habits";
import { Card, cn } from "../ui";
import { useWorkspace } from "@/lib/workspace-client";
import { HabitTimer } from "./HabitTimer";
import { goalOn, excused, paused } from "@/lib/habits";
import { HabitEditor } from "./HabitEditor";

export function HabitTracker({
  compact = false,
  initialDate,
}: {
  compact?: boolean;
  initialDate?: string;
}) {
  const now = useNow();
  const { preferences } = useWorkspace();
  const [showCompleted, setShowCompleted] = useState(false);
  const { entries, error: diaryError, refresh: refreshDiary } = useEntries();
  const { data, error, pending, refresh } = useHabits();
  const [editor, setEditor] = useState<Habit | "new" | null>(null);
  const [selected, setSelected] = useState<{
    habit: Habit;
    date: string;
  } | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(
    initialDate ?? null,
  );
  const [notice, setNotice] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [actionError, setActionError] = useState("");

  if (!now || !data || !entries)
    return (
      <Card className="min-h-40">
        {error || diaryError ? (
          <>
            <p role="alert" className="mb-3 text-sm text-bad">
              {error || diaryError}
            </p>
            <button
              onClick={() => {
                void refresh();
                void refreshDiary();
              }}
              className="primary-button"
            >
              Try again
            </button>
          </>
        ) : (
          <div className="space-y-3 animate-pulse" aria-label="Loading habits">
            <div className="h-6 w-36 rounded bg-surface-2" />
            <div className="h-14 rounded-xl bg-surface-2" />
          </div>
        )}
      </Card>
    );
  const today = now.today;
  const days = buildDays(entries);
  const routineOrder = { morning: 0, day: 1, evening: 2, anytime: 3 };
  const active = data.habits
    .filter((h) => !h.archived)
    .sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) ||
        routineOrder[a.routine ?? "anytime"] -
          routineOrder[b.routine ?? "anytime"] ||
        (a.order ?? 0) - (b.order ?? 0) ||
        a.name.localeCompare(b.name),
    );
  const list = compact ? active.filter((h) => scheduled(h, today)) : active;
  const complete = list.filter((h) =>
    h.schedule === "weekly"
      ? habitWeek(h, today, data.logs, days).met
      : (habitValue(h, today, data.logs, days) ?? -1) >=
        goalOn(h, today).target,
  ).length;
  const visibleList =
    compact && preferences.hideCompleted && !showCompleted
      ? list.filter(
          (h) =>
            (habitValue(h, today, data.logs, days) ?? -1) <
            goalOn(h, today).target,
        )
      : list;
  const week = weekStart(
    selectedWeek && selectedWeek <= today ? selectedWeek : today,
  );
  const thisWeek = week === weekStart(today);
  const perform = async (action: () => Promise<void>, message: string) => {
    setActionError("");
    try {
      await action();
      setNotice(message);
    } catch (err) {
      setNotice("");
      setActionError(
        err instanceof Error ? err.message : "Couldn't save. Please try again.",
      );
    }
  };
  const addStarter = (source: Habit["source"]) =>
    perform(
      () => saveHabit(starterHabit(source, today)),
      "Habit added. Make the target your own any time.",
    );

  return (
    <section
      aria-label={compact ? "Today's habits" : "Habit tracker"}
      className="space-y-4"
    >
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <p className="eyebrow">
              {compact ? "SMALL ACTIONS, REAL PROGRESS" : "YOUR DAILY PRACTICE"}
            </p>
            <h2 className="font-display mt-1 text-2xl font-semibold">
              {compact ? "Today’s habits" : "Your habits"}
            </h2>
          </div>
          {compact && active.length > 0 ? (
            <Link href="/habits" className="text-sm font-semibold text-accent">
              Manage <ChevronRight size={14} className="inline" />
            </Link>
          ) : (
            <button
              type="button"
              className="secondary-button !px-3"
              onClick={() => setEditor("new")}
            >
              <Plus size={16} /> Add habit
            </button>
          )}
        </div>
        {active.length === 0 ? (
          <div className="p-6">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Sprout size={23} />
            </div>
            <h3 className="font-display text-xl font-semibold">
              A better day starts small.
            </h3>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-2">
              Choose one or two habits you actually want to build. Give each a
              realistic target and a place in your day.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["exercised", "water", "outdoorMins"] as const).map((s) => (
                <button
                  disabled={pending.size > 0}
                  key={s}
                  type="button"
                  className="secondary-button text-sm"
                  onClick={() => void addStarter(s)}
                >
                  <Plus size={14} />
                  {s === "exercised"
                    ? "Move 3× a week"
                    : s === "water"
                      ? "Drink more water"
                      : "Get outside"}
                </button>
              ))}
              <button
                type="button"
                className="secondary-button text-sm"
                onClick={() => setEditor("new")}
              >
                <Plus size={14} /> My own habit
              </button>
            </div>
          </div>
        ) : (
          <>
            {compact && (
              <div className="flex items-center gap-3 px-5 pt-4">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-good transition-[width]"
                    style={{
                      width: `${list.length ? (complete / list.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-ink-2">
                  {complete}/{list.length} goals met
                </span>
              </div>
            )}
            {!compact && (
              <div className="flex items-center justify-between px-5 pt-4">
                <button
                  className="icon-button"
                  aria-label="Previous week"
                  disabled={active.every((h) => h.createdDate >= week)}
                  onClick={() => setSelectedWeek(addDays(week, -7))}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold"
                  onClick={() => setSelectedWeek(null)}
                >
                  {thisWeek
                    ? "This week"
                    : `${formatDayMonth(week)} – ${formatDayMonth(addDays(week, 6))}`}
                </button>
                <button
                  className="icon-button"
                  aria-label="Next week"
                  disabled={thisWeek}
                  onClick={() => setSelectedWeek(addDays(week, 7))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            <div className="divide-y divide-line px-5">
              {visibleList.map((habit, index) => (
                <div key={habit.id}>
                  {(index === 0 ||
                    visibleList[index - 1].routine !== habit.routine ||
                    visibleList[index - 1].pinned !== habit.pinned) && (
                    <p className="eyebrow pt-4">
                      {habit.pinned ? "Pinned" : (habit.routine ?? "Anytime")}
                    </p>
                  )}
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    today={today}
                    week={week}
                    logs={data.logs}
                    days={days}
                    compact={compact}
                    pending={pending.has(`${habit.id}:${today}`)}
                    onEdit={() => setEditor(habit)}
                    onDay={(date) => setSelected({ habit, date })}
                    onLog={(value) =>
                      void perform(
                        () => logHabit(habit.id, today, value),
                        value !== null && value >= habit.target
                          ? `${habit.name}: target reached. Nicely done.`
                          : `${habit.name}: saved.`,
                      )
                    }
                  />
                </div>
              ))}
            </div>
            {compact && preferences.hideCompleted && (
              <button
                className="secondary-button m-4 text-sm"
                onClick={() => setShowCompleted(!showCompleted)}
              >
                {showCompleted ? "Hide" : "Show"} completed habits
              </button>
            )}
            {list.length === 0 && (
              <p className="p-5 text-sm text-ink-2">
                A planned rest day. Your next habits are ready when you are.
              </p>
            )}
            {compact && list.length > 0 && complete === list.length && (
              <p className="border-t border-line bg-accent-soft px-5 py-3 text-sm font-medium text-accent">
                You’ve kept your promises to yourself. Enjoy the rest of your
                day.
              </p>
            )}
          </>
        )}
      </Card>
      {(actionError || error) && (
        <p role="alert" className="rounded-xl bg-surface p-3 text-sm text-bad">
          {actionError || error}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className={cn("text-xs text-good", !notice && "sr-only")}
      >
        {notice}
      </p>
      {!compact && active.length > 0 && (
        <p className="text-xs leading-relaxed text-muted">
          Tap a day to log or correct it. A tick means target reached, a number
          means progress, · means not logged, and — means a rest day. Weekly
          goals give you the freedom to choose your days.
        </p>
      )}
      {!compact && data.habits.some((h) => h.archived) && (
        <div>
          <button
            className="secondary-button text-sm"
            onClick={() => setShowArchive(!showArchive)}
          >
            {showArchive ? "Hide" : "Show"} archived habits
          </button>
          {showArchive &&
            data.habits
              .filter((h) => h.archived)
              .map((h) => (
                <div
                  key={h.id}
                  className="mt-3 flex items-center justify-between rounded-xl border border-line p-3"
                >
                  <span>{h.name}</span>
                  <button
                    className="secondary-button text-sm"
                    onClick={() =>
                      void perform(
                        () => saveHabit({ ...h, archived: false }),
                        "Habit restored.",
                      )
                    }
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                </div>
              ))}
        </div>
      )}
      {editor && (
        <HabitEditor
          habit={editor === "new" ? undefined : editor}
          today={today}
          onClose={() => setEditor(null)}
          onArchive={
            editor === "new"
              ? undefined
              : async () => {
                  await saveHabit({ ...editor, archived: true });
                  setEditor(null);
                }
          }
        />
      )}
      {selected && (
        <HabitDay
          habit={selected.habit}
          date={selected.date}
          value={habitValue(selected.habit, selected.date, data.logs, days)}
          busy={pending.has(`${selected.habit.id}:${selected.date}`)}
          onClose={() => setSelected(null)}
          onSave={async (value, status) => {
            await logHabit(selected.habit.id, selected.date, value, status);
            setSelected(null);
            setNotice("Habit log saved.");
          }}
        />
      )}
    </section>
  );
}

function HabitRow({
  habit,
  today,
  week,
  logs,
  days,
  compact,
  pending,
  onEdit,
  onDay,
  onLog,
}: {
  habit: Habit;
  today: string;
  week: string;
  logs: HabitLog[];
  days: DayRecord[];
  compact: boolean;
  pending: boolean;
  onEdit: () => void;
  onDay: (date: string) => void;
  onLog: (value: number | null) => void;
}) {
  const currentWeek = compact || week === weekStart(today);
  const currentGoal = goalOn(habit, today);
  const value = habitValue(habit, today, logs, days);
  const resting = paused(habit, today) || excused(habit, today, logs);
  const done = value !== undefined && value >= currentGoal.target;
  const stats = habitWeek(
    habit,
    addDays(week, 6) > today ? today : addDays(week, 6),
    logs,
    days,
  );
  const streak = habitStreak(habit, today, logs, days);
  const recentDates = Array.from({ length: 28 }, (_, i) =>
    addDays(today, -i),
  ).filter((d) => scheduled(habit, d) && !excused(habit, d, logs));
  const recorded = recentDates.filter(
    (d) => habitValue(habit, d, logs, days) !== undefined,
  ).length;
  const achieved = recentDates.filter(
    (d) => (habitValue(habit, d, logs, days) ?? -1) >= goalOn(habit, d).target,
  ).length;
  return (
    <div className="py-4">
      <div className="flex items-center gap-3">
        {currentWeek ? (
          <button
            type="button"
            disabled={pending || resting}
            aria-label={
              habit.kind === "count"
                ? `Set ${habit.name} amount`
                : `${done ? "Undo" : "Complete"} ${habit.name}`
            }
            aria-pressed={done}
            onClick={() =>
              habit.kind === "count"
                ? onDay(today)
                : onLog(done ? 0 : currentGoal.target)
            }
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition active:scale-95 disabled:opacity-50",
              done
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-surface-2/50 text-muted",
            )}
          >
            {done ? <Check size={21} /> : <Circle size={21} />}
          </button>
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Sprout size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{habit.name}</h3>
          <p className="mt-0.5 text-xs text-ink-2">
            {habit.kind === "count"
              ? `${value === undefined ? "—" : value.toLocaleString("en-AU")} / ${currentGoal.target.toLocaleString("en-AU")} ${habit.unit}`
              : resting
                ? paused(habit, today)
                  ? "Paused today"
                  : "Excused today"
                : currentGoal.schedule === "weekly"
                  ? `${stats.completed} / ${stats.goal} days this week`
                  : done
                    ? "Done for today"
                    : value === 0
                      ? "Not done today"
                      : "Ready when you are"}
          </p>
          {habit.cue && <p className="mt-1 text-xs text-muted">{habit.cue}</p>}
        </div>
        {habit.kind === "count" && currentWeek && (
          <div className="flex items-center gap-1">
            <button
              className="icon-button"
              disabled={pending || resting || value === undefined || value <= 0}
              aria-label={`Decrease ${habit.name}`}
              onClick={() =>
                onLog(
                  Math.max(
                    0,
                    Math.round(((value ?? 0) - habit.step) * 100) / 100,
                  ),
                )
              }
            >
              <Minus size={16} />
            </button>
            <button
              className="icon-button !border-line !bg-surface-2"
              disabled={
                pending || resting || (value ?? 0) >= maxHabitValue(habit)
              }
              aria-label={`Add ${habit.step} ${habit.unit} to ${habit.name}`}
              onClick={() =>
                onLog(
                  Math.min(
                    maxHabitValue(habit),
                    Math.round(((value ?? 0) + habit.step) * 100) / 100,
                  ),
                )
              }
            >
              <Plus size={18} />
            </button>
          </div>
        )}
        {!compact && (
          <button
            className="icon-button"
            aria-label={`Edit ${habit.name}`}
            onClick={onEdit}
          >
            <Pencil size={16} />
          </button>
        )}
      </div>
      {habit.timerMinutes && habit.timerMinutes > 0 && !resting ? (
        <HabitTimer habit={habit} />
      ) : null}
      {!compact && (
        <>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {stats.dates.map((date) => {
              const v = habitValue(habit, date, logs, days);
              const met = v !== undefined && v >= goalOn(habit, date).target;
              const excluded = excused(habit, date, logs);
              const available = scheduled(habit, date) && date <= today;
              return (
                <div key={date} className="text-center">
                  <span className="text-[10px] font-semibold text-muted">
                    {formatWeekday(date)}
                  </span>
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => onDay(date)}
                    aria-label={`${habit.name}, ${formatLong(date)}: ${!scheduled(habit, date) ? (paused(habit, date) ? "paused" : "rest day") : excluded ? "excused" : met ? "complete" : v === undefined ? "not logged" : `${v} ${habit.unit}`}`}
                    className={cn(
                      "mt-1 grid min-h-11 w-full place-items-center rounded-xl border text-xs font-semibold disabled:opacity-40",
                      met
                        ? "border-good/20 bg-good/10 text-good"
                        : "border-line bg-surface-2/40 text-ink-2",
                      date === today && "ring-1 ring-accent",
                    )}
                  >
                    {!scheduled(habit, date) ? (
                      paused(habit, date) ? (
                        "Ⅱ"
                      ) : (
                        "—"
                      )
                    ) : excluded ? (
                      "Ⅱ"
                    ) : met ? (
                      <Check size={16} />
                    ) : v === undefined ? (
                      "·"
                    ) : (
                      v
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-ink-2">
            Last 28 days · {achieved}/{recentDates.length} eligible days
            achieved · {recorded} recorded
          </p>
          <div className="mt-3 flex justify-between gap-2 text-xs text-muted">
            <span>
              {stats.completed}/{stats.goal} days{" "}
              {stats.met ? "· weekly goal met" : "toward this week’s goal"}
            </span>
            {streak > 1 && (
              <span className="inline-flex items-center gap-1">
                <Flame size={13} />
                {streak}{" "}
                {habit.schedule === "weekly" ? "weeks" : "scheduled days"}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HabitDay({
  habit,
  date,
  value,
  busy,
  onClose,
  onSave,
}: {
  habit: Habit;
  date: string;
  value?: number;
  busy: boolean;
  onClose: () => void;
  onSave: (
    value: number | null,
    status?: "logged" | "excused",
  ) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [number, setNumber] = useState(
    value === undefined ? "" : String(value),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const save = async (
    v: number | null,
    status: "logged" | "excused" = "logged",
  ) => {
    try {
      await onSave(v, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
  };
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="habit-day-title"
      className="modal w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-line bg-bg p-6 text-ink"
    >
      <div className="flex justify-between">
        <div>
          <h2
            id="habit-day-title"
            className="font-display text-xl font-semibold"
          >
            {habit.name}
          </h2>
          <p className="mt-1 text-sm text-muted">{formatLong(date)}</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close log"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {habit.kind === "count" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(Number(number));
          }}
          className="mt-5 space-y-3"
        >
          <label className="block text-sm font-semibold">
            Amount {habit.unit && `(${habit.unit})`}
            <input
              autoFocus
              required
              type="number"
              min="0"
              max={maxHabitValue(habit)}
              step="any"
              className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="primary-button w-full"
          >
            Save amount
          </button>
        </form>
      ) : (
        <div className="mt-5 flex gap-2">
          <button
            className="primary-button flex-1"
            disabled={busy}
            onClick={() => void save(1)}
          >
            Done
          </button>
          <button
            className="secondary-button flex-1"
            disabled={busy}
            onClick={() => void save(0)}
          >
            Not done
          </button>
        </div>
      )}
      <button
        className="secondary-button mt-4 w-full"
        disabled={busy}
        onClick={() => void save(0, "excused")}
      >
        Excuse this day
      </button>
      <p className="mt-2 text-xs text-muted">
        Excused days are excluded from goals and comparisons. Clear the log to
        return to an unrecorded day.
      </p>
      <button
        type="button"
        disabled={busy}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-muted"
        onClick={() => void save(null)}
      >
        <RotateCcw size={14} /> Clear quick log
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </dialog>
  );
}

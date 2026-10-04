"use client";

import { ArrowUpRight, Check, Leaf } from "lucide-react";
import Link from "next/link";
import { average, buildDays } from "@/lib/analytics";
import { useEntries, useNow } from "@/lib/client";
import { addDays, formatDayMonth } from "@/lib/dates";
import { useHabits } from "@/lib/habit-client";
import { habitValue, scheduled, goalOn, excused } from "@/lib/habits";
import { Card } from "../ui";

export function WeeklyReview() {
  const now = useNow();
  const { entries } = useEntries();
  const { data } = useHabits();
  if (!now || !entries || !data) return null;
  const to = addDays(now.today, -1),
    from = addDays(to, -6);
  const days = buildDays(entries);
  const recent = days.filter((d) => d.date >= from && d.date <= to);
  const previous = days.filter(
    (d) => d.date >= addDays(from, -7) && d.date < from,
  );
  const scoreDays = recent.filter((d) => d.wellbeing !== undefined);
  const previousScoreDays = previous.filter((d) => d.wellbeing !== undefined);
  const score = average(scoreDays, (d) => d.wellbeing);
  const prevScore = average(previousScoreDays, (d) => d.wellbeing);
  const comparisons = data.habits
    .filter((h) => !h.archived && h.createdDate <= to)
    .map((habit) => {
      const dates = Array.from({ length: 7 }, (_, i) =>
        addDays(from, i),
      ).filter((d) => scheduled(habit, d) && !excused(habit, d, data.logs));
      const complete = dates.filter(
        (d) =>
          (habitValue(habit, d, data.logs, days) ?? -1) >=
          goalOn(habit, d).target,
      ).length;
      const logged = dates.filter(
        (d) => habitValue(habit, d, data.logs, days) !== undefined,
      ).length;
      const goal =
        habit.schedule === "weekly"
          ? Math.min(habit.weeklyTarget, dates.length)
          : dates.length;
      return { habit, complete, logged, goal };
    })
    .filter((h) => h.goal > 0);
  const totalCompleted = comparisons.reduce(
    (n, h) => n + Math.min(h.complete, h.goal),
    0,
  );
  const totalGoals = comparisons.reduce((n, h) => n + h.goal, 0);
  const least = [...comparisons]
    .filter((h) => h.logged >= 3)
    .sort((a, b) => a.complete / a.goal - b.complete / b.goal)[0];
  const suggestion = !comparisons.length
    ? "Choose one small habit. Attach it to something you already do, and make the first step easy."
    : least && least.complete < least.goal
      ? `Make “${least.habit.name}” easier to start. ${least.habit.cue ? `Try your cue: ${least.habit.cue}.` : "Give it a specific cue, such as after breakfast."} Keep that one change for a week.`
      : "Keep your targets steady for another week. Consistency will tell you more than adding extra habits.";
  const win = entries
    .filter((e) => e.date >= from && e.date <= to && e.data.mind?.win)
    .at(-1)?.data.mind?.win;
  const delta =
    score !== undefined &&
    prevScore !== undefined &&
    scoreDays.length >= 3 &&
    previousScoreDays.length >= 3
      ? score - prevScore
      : undefined;
  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">PAUSE. NOTICE. ADJUST.</p>
        <Leaf size={18} className="text-accent" />
      </div>
      <h2 className="font-display mt-2 text-2xl font-semibold">
        Your weekly reset
      </h2>
      <p className="mt-1 text-xs text-muted">
        Last 7 complete days · {formatDayMonth(from)} – {formatDayMonth(to)}
      </p>
      <div className="my-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2/60 p-3">
          <p className="text-2xl font-semibold">
            {totalGoals ? `${totalCompleted}/${totalGoals}` : "—"}
          </p>
          <p className="mt-1 text-xs text-ink-2">habit days achieved</p>
        </div>
        <div className="rounded-2xl bg-surface-2/60 p-3">
          <p className="text-2xl font-semibold">
            {score === undefined ? "—" : Math.round(score)}
            <span className="ml-1 text-xs font-normal text-muted">/100</span>
          </p>
          <p className="mt-1 text-xs text-ink-2">
            day score · {scoreDays.length} logged days
          </p>
        </div>
      </div>
      {delta !== undefined && (
        <p className="mb-4 text-sm text-ink-2">
          Your average day score was {Math.abs(Math.round(delta))} points{" "}
          {delta >= 0 ? "higher" : "lower"} than the previous 7 days. Compare it
          with your own baseline.
        </p>
      )}
      {win && (
        <div className="mb-4 border-l-2 border-accent pl-3">
          <p className="mb-1 text-xs font-semibold text-accent">
            A win worth remembering
          </p>
          <p className="text-sm leading-relaxed text-ink-2">{win}</p>
        </div>
      )}
      <div className="rounded-2xl bg-accent-soft p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Check size={15} /> One thing for the next 7 days
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{suggestion}</p>
      </div>
      <Link
        href={comparisons.length ? "/insights" : "/habits"}
        className="mt-4 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"
      >
        {comparisons.length
          ? "Explore your patterns"
          : "Choose your first habit"}
        <ArrowUpRight size={16} />
      </Link>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Unlogged days stay unknown. Habit counts respect dated goals and pauses;
        day scores describe how you felt.
      </p>
    </Card>
  );
}

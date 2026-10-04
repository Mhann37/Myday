import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDays, computeInsights } from "../lib/analytics";
import { enrichDays, habitDrivers } from "../lib/habit-analytics";
import {
  habitStreak,
  habitValue,
  habitWeek,
  scheduled,
  starterHabit,
  type HabitLog,
} from "../lib/habits";
import { dateSchema } from "../lib/schema";
import { addDays } from "../lib/dates";
import { dailyCsv, rawCsv } from "../lib/export";
import type { Entry } from "../lib/schema";

const log = (habitId: string, date: string, value: number): HabitLog => ({
  habitId,
  date,
  value,
  updatedAt: `${date}T18:00:00Z`,
});

test("real dates, including leap days, are validated before database writes", () => {
  for (const date of ["2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10"])
    assert.equal(dateSchema.safeParse(date).success, false);
  assert.equal(dateSchema.safeParse("2028-02-29").success, true);
});

test("missing cardio is unknown when lifting was false", () => {
  const days = buildDays([
    {
      date: "2026-10-04",
      period: "night",
      data: { training: { lifted: false } },
      updatedAt: "2026-10-04T12:00:00Z",
    },
  ]);
  assert.equal(days[0].exercised, undefined);
});

test("quick log overrides diary, clearing it restores diary, zero is distinct from missing", () => {
  const habit = starterHabit("water", "2026-10-01");
  const days = buildDays([
    {
      date: "2026-10-04",
      period: "night",
      data: { habits: { water: 6 } },
      updatedAt: "2026-10-04T12:00:00Z",
    },
  ]);
  assert.equal(habitValue(habit, "2026-10-04", [], days), 6);
  assert.equal(
    habitValue(habit, "2026-10-04", [log(habit.id, "2026-10-04", 0)], days),
    0,
  );
  assert.equal(habitValue(habit, "2026-10-03", [], days), undefined);
});

test("daily goals respect selected days, creation date, and future days", () => {
  const habit = { ...starterHabit("custom", "2026-09-30"), days: [0, 2, 4] };
  assert.equal(scheduled(habit, "2026-09-28"), false);
  assert.equal(scheduled(habit, "2026-10-01"), false);
  const stats = habitWeek(
    habit,
    "2026-10-01",
    [log(habit.id, "2026-09-30", 1), log(habit.id, "2026-10-02", 1)],
    [],
  );
  assert.equal(stats.goal, 2);
  assert.equal(stats.elapsed, 1);
  assert.equal(stats.completed, 1);
  assert.equal(stats.met, false);
});

test("rest days don't break daily streaks and today's pending action is allowed", () => {
  const habit = { ...starterHabit("custom", "2026-09-28"), days: [0, 2, 4] };
  const logs = [
    log(habit.id, "2026-09-28", 1),
    log(habit.id, "2026-09-30", 1),
    log(habit.id, "2026-10-02", 1),
  ];
  assert.equal(habitStreak(habit, "2026-10-04", logs, []), 3);
  assert.equal(habitStreak(habit, "2026-10-05", logs, []), 3);
  assert.equal(habitStreak(habit, "2026-10-06", logs, []), 0);
});

test("flexible weekly goal counts days, caps onboarding week, and keeps a pending week alive", () => {
  const habit = starterHabit("exercised", "2026-09-28");
  const logs = [
    log(habit.id, "2026-09-28", 1),
    log(habit.id, "2026-09-30", 1),
    log(habit.id, "2026-10-02", 1),
  ];
  assert.equal(habitWeek(habit, "2026-10-04", logs, []).met, true);
  assert.equal(habitStreak(habit, "2026-10-05", logs, []), 1);
  assert.equal(
    habitWeek({ ...habit, createdDate: "2026-10-04" }, "2026-10-04", [], [])
      .goal,
    1,
  );
});

test("quick logs enrich analytics and exports without fabricating mood or check-ins", () => {
  const habit = starterHabit("water", "2026-10-01");
  const data = { habits: [habit], logs: [log(habit.id, "2026-10-04", 8)] };
  const days = enrichDays([], data);
  assert.equal(days[0].water, 8);
  assert.equal(days[0].wellbeing, undefined);
  assert.equal(days[0].hasNight, false);
  assert.equal(days[0].habitTargets?.[habit.id], true);
  assert.ok(dailyCsv([], data).includes("2026-10-04"));
  assert.equal(computeInsights(days, habitDrivers(data)).length, 0);
});

test("custom habit outcomes join the corrected comparison family", () => {
  const habit = { ...starterHabit("custom", "2026-08-01"), name: "Read" };
  const entries: Entry[] = [];
  const logs: HabitLog[] = [];
  for (let i = 0; i < 60; i++) {
    const date = addDays("2026-08-01", i);
    const done = i % 2 === 0;
    entries.push({
      date,
      period: "night",
      data: {
        me: {
          mood: done ? 4 + (i % 4 === 0 ? 1 : 0) : 1 + (i % 4 === 1 ? 1 : 0),
          energy: (i % 3) + 2,
        },
      },
      updatedAt: `${date}T18:00:00Z`,
    });
    logs.push(log(habit.id, date, Number(done)));
  }
  const data = { habits: [habit], logs };
  const insights = computeInsights(
    enrichDays(buildDays(entries), data),
    habitDrivers(data),
  );
  const effect = insights.find(
    (i) => i.driverId === `habit:${habit.id}` && i.outcomeId === "mood",
  );
  assert.ok(effect);
  assert.ok(effect.q < 0.01);
  assert.equal(effect.nWith, 30);
  assert.equal(effect.nWithout, 30);
});

test("CSV notes cannot be interpreted as spreadsheet formulas", () => {
  const csv = rawCsv([
    {
      date: "2026-10-04",
      period: "night",
      data: { notes: '=HYPERLINK("bad")' },
      updatedAt: "2026-10-04T18:00:00Z",
    },
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
});

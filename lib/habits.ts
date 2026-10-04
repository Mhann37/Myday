import { z } from "zod";
import type { DayRecord } from "./analytics";
import { addDays, dateRange, weekdayIndex } from "./dates";
import { dateSchema } from "./schema";

export const habitSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    cue: z.string().trim().max(160).default(""),
    kind: z.enum(["check", "count"]),
    target: z.number().positive().max(100000),
    unit: z.string().trim().max(24).default(""),
    step: z.number().positive().max(100000).default(1),
    schedule: z.enum(["daily", "weekly"]),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    weeklyTarget: z.number().int().min(1).max(7).default(3),
    source: z.enum([
      "custom",
      "water",
      "steps",
      "outdoorMins",
      "sleepHours",
      "exercised",
      "lifted",
      "wifeTime",
    ]),
    createdDate: dateSchema,
    archived: z.boolean().default(false),
  })
  .refine((h) => h.kind !== "check" || h.target === 1, {
    message: "Check habits have a target of one",
  })
  .refine(
    (h) => {
      const limits = {
        water: 40,
        outdoorMins: 1440,
        sleepHours: 24,
        steps: 100000,
        exercised: 1,
        lifted: 1,
        wifeTime: 1,
        custom: 100000,
      };
      const checkSource = ["exercised", "lifted", "wifeTime"].includes(
        h.source,
      );
      return (
        h.target <= limits[h.source] &&
        h.step <= limits[h.source] &&
        (h.source === "custom" || h.kind === (checkSource ? "check" : "count"))
      );
    },
    { message: "Choose a target and log type appropriate to this measurement" },
  );

export const habitLogSchema = z.object({
  habitId: z.string().uuid(),
  date: dateSchema,
  value: z.number().min(0).max(100000).nullable(),
});
export type Habit = z.infer<typeof habitSchema>;
export interface HabitLog {
  habitId: string;
  date: string;
  value: number;
  updatedAt: string;
}
export interface HabitData {
  habits: Habit[];
  logs: HabitLog[];
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function maxHabitValue(habit: Habit): number {
  return {
    water: 40,
    outdoorMins: 1440,
    sleepHours: 24,
    steps: 100000,
    exercised: 1,
    lifted: 1,
    wifeTime: 1,
    custom: habit.kind === "check" ? 1 : 100000,
  }[habit.source];
}
export const SOURCES = [
  {
    key: "custom",
    label: "New habit",
    kind: "check",
    unit: "",
    target: 1,
    step: 1,
  },
  {
    key: "exercised",
    label: "Movement",
    kind: "check",
    unit: "",
    target: 1,
    step: 1,
  },
  {
    key: "lifted",
    label: "Strength training",
    kind: "check",
    unit: "",
    target: 1,
    step: 1,
  },
  {
    key: "water",
    label: "Water",
    kind: "count",
    unit: "glasses",
    target: 8,
    step: 1,
  },
  {
    key: "outdoorMins",
    label: "Time outside",
    kind: "count",
    unit: "min",
    target: 30,
    step: 10,
  },
  {
    key: "steps",
    label: "Daily steps",
    kind: "count",
    unit: "steps",
    target: 8000,
    step: 1000,
  },
  {
    key: "sleepHours",
    label: "Sleep",
    kind: "count",
    unit: "hours",
    target: 7.5,
    step: 0.5,
  },
  {
    key: "wifeTime",
    label: "Quality time together",
    kind: "check",
    unit: "",
    target: 1,
    step: 1,
  },
] as const;

export function scheduled(habit: Habit, date: string): boolean {
  return (
    date >= habit.createdDate &&
    (habit.schedule === "weekly" || habit.days.includes(weekdayIndex(date)))
  );
}

/** An explicit quick log takes precedence; absent answers always stay unknown. */
export function habitValue(
  habit: Habit,
  date: string,
  logs: HabitLog[],
  days: DayRecord[],
): number | undefined {
  const log = logs.find((l) => l.habitId === habit.id && l.date === date);
  if (log) return log.value;
  if (habit.source === "custom") return undefined;
  const value = days.find((d) => d.date === date)?.[habit.source];
  return typeof value === "boolean" ? Number(value) : value;
}

export function weekStart(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function habitWeek(
  habit: Habit,
  date: string,
  logs: HabitLog[],
  days: DayRecord[],
) {
  const start = weekStart(date);
  const dates = dateRange(start, addDays(start, 6));
  const eligible = dates.filter((d) => scheduled(habit, d));
  const elapsed = eligible.filter((d) => d <= date);
  const completed = elapsed.filter(
    (d) => (habitValue(habit, d, logs, days) ?? -1) >= habit.target,
  ).length;
  const logged = elapsed.filter(
    (d) => habitValue(habit, d, logs, days) !== undefined,
  ).length;
  const goal =
    habit.schedule === "weekly"
      ? Math.min(habit.weeklyTarget, eligible.length)
      : eligible.length;
  return {
    dates,
    elapsed: elapsed.length,
    completed,
    logged,
    goal,
    met: goal > 0 && completed >= goal,
  };
}

/** Rest days don't break a run. Today's pending action gets a chance to be done. */
export function habitStreak(
  habit: Habit,
  today: string,
  logs: HabitLog[],
  days: DayRecord[],
): number {
  if (habit.schedule === "weekly") {
    let count = 0;
    let end = addDays(weekStart(today), -1);
    if (habitWeek(habit, today, logs, days).met) {
      count++;
    }
    while (end >= habit.createdDate && habitWeek(habit, end, logs, days).met) {
      count++;
      end = addDays(end, -7);
    }
    return count;
  }
  let count = 0;
  for (let d = today; d >= habit.createdDate; d = addDays(d, -1)) {
    if (!scheduled(habit, d)) continue;
    if ((habitValue(habit, d, logs, days) ?? -1) >= habit.target) count++;
    else if (d !== today) break;
  }
  return count;
}

export function starterHabit(source: Habit["source"], date: string): Habit {
  const template = SOURCES.find((s) => s.key === source)!;
  return habitSchema.parse({
    id: crypto.randomUUID(),
    name: template.label,
    cue: "",
    kind: template.kind,
    target: template.target,
    step: template.step,
    unit: template.unit,
    source,
    schedule:
      source === "exercised" || source === "lifted" ? "weekly" : "daily",
    days: [0, 1, 2, 3, 4, 5, 6],
    weeklyTarget: 3,
    createdDate: date,
    archived: false,
  });
}

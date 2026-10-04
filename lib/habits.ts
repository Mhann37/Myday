import { z } from "zod";
import type { DayRecord } from "./analytics";
import { addDays, dateRange, weekdayIndex } from "./dates";
import { dateSchema } from "./schema";

const goalSchema = z.object({
  effectiveFrom: dateSchema,
  target: z.number().positive().max(100000),
  schedule: z.enum(["daily", "weekly"]),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  weeklyTarget: z.number().int().min(1).max(7),
});

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
    routine: z.enum(["morning", "day", "evening", "anytime"]).optional(),
    pinned: z.boolean().optional(),
    order: z.number().int().min(0).max(1000).optional(),
    timerMinutes: z.number().int().min(0).max(180).optional(),
    pauses: z
      .array(
        z.object({
          from: dateSchema,
          to: dateSchema,
          reason: z.string().max(80),
        }),
      )
      .max(100)
      .optional(),
    goals: z.array(goalSchema).max(500).optional(),
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
        (!(h.timerMinutes ?? 0) ||
          h.kind === "check" ||
          (h.source === "custom" &&
            ["min", "minutes"].includes(h.unit.toLowerCase()))) &&
        (h.pauses ?? []).every((p) => p.to >= p.from) &&
        new Set((h.goals ?? []).map((g) => g.effectiveFrom)).size ===
          (h.goals ?? []).length &&
        (h.goals ?? []).every(
          (g) =>
            g.effectiveFrom >= h.createdDate &&
            new Set(g.days).size === g.days.length &&
            g.target <= limits[h.source] &&
            (h.kind !== "check" || g.target === 1),
        ) &&
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
  status: z.enum(["logged", "excused"]).optional(),
  source: z.string().max(100).optional(),
});
export type Habit = z.infer<typeof habitSchema>;
export interface HabitLog {
  habitId: string;
  date: string;
  value: number;
  updatedAt: string;
  status?: "logged" | "excused";
  source?: string;
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
  const goal = goalOn(habit, date);
  return (
    date >= habit.createdDate &&
    !paused(habit, date) &&
    (goal.schedule === "weekly" || goal.days.includes(weekdayIndex(date)))
  );
}

export function paused(habit: Habit, date: string): boolean {
  return !!habit.pauses?.some((p) => date >= p.from && date <= p.to);
}
export function goalOn(habit: Habit, date: string) {
  return (
    [...(habit.goals ?? [])]
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .find((g) => g.effectiveFrom <= date) ?? habit
  );
}
export function excused(habit: Habit, date: string, logs: HabitLog[]) {
  return logs.some(
    (l) => l.habitId === habit.id && l.date === date && l.status === "excused",
  );
}
export function preserveGoals(
  previous: Habit | undefined,
  next: Habit,
  effectiveFrom: string,
): Habit {
  if (!previous)
    return {
      ...next,
      goals: [
        {
          effectiveFrom: next.createdDate,
          target: next.target,
          schedule: next.schedule,
          days: next.days,
          weeklyTarget: next.weeklyTarget,
        },
      ],
    };
  const goals = previous.goals ?? [
    {
      effectiveFrom: previous.createdDate,
      target: previous.target,
      schedule: previous.schedule,
      days: previous.days,
      weeklyTarget: previous.weeklyTarget,
    },
  ];
  const changed = ["target", "schedule", "days", "weeklyTarget"].some(
    (k) =>
      JSON.stringify(previous[k as keyof Habit]) !==
      JSON.stringify(next[k as keyof Habit]),
  );
  if (!changed) return { ...next, createdDate: previous.createdDate, goals };
  return {
    ...next,
    createdDate: previous.createdDate,
    goals: [
      ...goals.filter((g) => g.effectiveFrom !== effectiveFrom),
      {
        effectiveFrom,
        target: next.target,
        schedule: next.schedule,
        days: next.days,
        weeklyTarget: next.weeklyTarget,
      },
    ].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
  };
}

/** An explicit quick log takes precedence; absent answers always stay unknown. */
export function habitValue(
  habit: Habit,
  date: string,
  logs: HabitLog[],
  days: DayRecord[],
): number | undefined {
  const log = logs.find((l) => l.habitId === habit.id && l.date === date);
  if (log) return log.status === "excused" ? undefined : log.value;
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
  const eligible = dates.filter(
    (d) => scheduled(habit, d) && !excused(habit, d, logs),
  );
  const elapsed = eligible.filter((d) => d <= date);
  const completed = elapsed.filter(
    (d) => (habitValue(habit, d, logs, days) ?? -1) >= goalOn(habit, d).target,
  ).length;
  const logged = elapsed.filter(
    (d) => habitValue(habit, d, logs, days) !== undefined,
  ).length;
  const currentGoal = goalOn(habit, date);
  const goal =
    currentGoal.schedule === "weekly"
      ? Math.min(currentGoal.weeklyTarget, eligible.length)
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
  if (goalOn(habit, today).schedule === "weekly") {
    let count = 0;
    let end = addDays(weekStart(today), -1);
    if (habitWeek(habit, today, logs, days).met) {
      count++;
    }
    while (end >= habit.createdDate) {
      const stats = habitWeek(habit, end, logs, days);
      if (stats.goal === 0) {
        end = addDays(end, -7);
        continue;
      }
      if (!stats.met) break;
      count++;
      end = addDays(end, -7);
    }
    return count;
  }
  let count = 0;
  for (let d = today; d >= habit.createdDate; d = addDays(d, -1)) {
    if (!scheduled(habit, d) || excused(habit, d, logs)) continue;
    if ((habitValue(habit, d, logs, days) ?? -1) >= goalOn(habit, d).target)
      count++;
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

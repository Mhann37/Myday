import { z } from "zod";
import { dateSchema } from "./schema";
import { addDays, dateRange, diffDays } from "./dates";
import {
  habitValue,
  scheduled,
  goalOn,
  excused,
  type HabitData,
} from "./habits";
import type { DayRecord } from "./analytics";
import type { Outcome } from "./preferences";

export const experimentSchema = z
  .object({
    id: z.string().uuid(),
    action: z.string().trim().min(1).max(240),
    habitId: z.string().uuid().nullable(),
    outcome: z.enum(["energy", "mood", "stress", "sleepHours"]),
    start: dateSchema,
    reviewDate: dateSchema,
    baselineFrom: dateSchema,
    decision: z
      .enum(["continue", "simplify", "change"])
      .nullable()
      .default(null),
    reflection: z.string().max(600).default(""),
    reviewedAt: z.string().datetime().nullable().default(null),
  })
  .refine(
    (e) =>
      e.baselineFrom < e.start &&
      e.reviewDate > e.start &&
      diffDays(e.reviewDate, e.start) <= 90,
    "Choose a review date after the start, within 90 days",
  );
export type Experiment = z.infer<typeof experimentSchema>;

export function measuredOutcome(
  days: DayRecord[],
  outcome: Outcome,
  from: string,
  to: string,
) {
  const values = days
    .filter((d) => d.date >= from && d.date <= to)
    .flatMap((d) =>
      typeof d[outcome] === "number" ? [d[outcome] as number] : [],
    );
  return {
    n: values.length,
    mean: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : undefined,
  };
}
export function experimentSummary(
  e: Experiment,
  days: DayRecord[],
  data: HabitData,
  today: string,
) {
  const end = today < e.reviewDate ? today : addDays(e.reviewDate, -1);
  const before = measuredOutcome(
    days,
    e.outcome,
    e.baselineFrom,
    addDays(e.start, -1),
  );
  const after = measuredOutcome(days, e.outcome, e.start, end);
  const habit = data.habits.find((h) => h.id === e.habitId);
  const eligible = habit
    ? dateRange(e.start, end).filter(
        (d) => scheduled(habit, d) && !excused(habit, d, data.logs),
      )
    : [];
  const completed = habit
    ? eligible.filter(
        (d) =>
          (habitValue(habit, d, data.logs, days) ?? -1) >=
          goalOn(habit, d).target,
      ).length
    : 0;
  const logged = habit
    ? eligible.filter(
        (d) => habitValue(habit, d, data.logs, days) !== undefined,
      ).length
    : 0;
  return {
    before,
    after,
    completed,
    logged,
    eligible: eligible.length,
    delta:
      before.n >= 5 && after.n >= 5 ? after.mean! - before.mean! : undefined,
  };
}

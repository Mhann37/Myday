import { z } from "zod";
import type { Entry } from "./schema";
import { addDays } from "./dates";
import {
  habitValue,
  habitWeek,
  goalOn,
  scheduled,
  excused,
  type HabitData,
} from "./habits";
import { buildDays } from "./analytics";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const reminderSettingsSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  timezone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
  quietStart: time,
  quietEnd: time,
  reminders: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(60),
        time,
        habitId: z.string().uuid().nullable(),
        period: z.enum(["morning", "night"]).nullable(),
      }),
    )
    .max(20),
  subscription: z.object({
    endpoint: z
      .string()
      .url()
      .max(2000)
      .refine((v) => {
        const url = new URL(v);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          [
            "fcm.googleapis.com",
            "updates.push.services.mozilla.com",
            "web.push.apple.com",
          ].some(
            (host) =>
              url.hostname === host || url.hostname.endsWith("." + host),
          )
        );
      }),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
  }),
});
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;
export function zoned(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
  };
}
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function quiet(at: number, start: string, end: string) {
  const a = mins(start),
    b = mins(end);
  return a === b ? false : a < b ? at >= a && at < b : at >= a || at < b;
}
export function dueReminders(
  s: ReminderSettings,
  now: Date,
  entries: Entry[],
  data: HabitData,
) {
  const local = zoned(now, s.timezone);
  if (!s.enabled || quiet(local.minute, s.quietStart, s.quietEnd)) return [];
  const today = local.minute < 240 ? addDays(local.date, -1) : local.date;
  return s.reminders
    .filter(
      (r) => local.minute >= mins(r.time) && local.minute - mins(r.time) < 10,
    )
    .filter((r) => reminderOutstanding(r, today, entries, data))
    .map((r) => ({ ...r, diaryDate: today, calendarDate: local.date }));
}

export function reminderOutstanding(
  r: { period: string | null; habitId: string | null },
  date: string,
  entries: Entry[],
  data: HabitData,
) {
  if (r.period && entries.some((e) => e.date === date && e.period === r.period))
    return false;
  if (r.habitId) {
    const h = data.habits.find((h) => h.id === r.habitId);
    if (!h || h.archived || !scheduled(h, date) || excused(h, date, data.logs))
      return false;
    const days = buildDays(entries);
    if ((habitValue(h, date, data.logs, days) ?? -1) >= goalOn(h, date).target)
      return false;
    if (
      goalOn(h, date).schedule === "weekly" &&
      habitWeek(h, date, data.logs, days).met
    )
      return false;
  }
  return true;
}

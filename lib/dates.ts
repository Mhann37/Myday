import { DAY_ROLLOVER_HOUR } from "./config";

// Dates are plain "YYYY-MM-DD" strings in the phone's local time. All the
// arithmetic goes through UTC so daylight-saving changes can never skip a day.

const pad = (n: number) => String(n).padStart(2, "0");

export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The day a check-in made right now belongs to (rolls over at 4am). */
export function logicalToday(now: Date = new Date()): string {
  const today = localDateString(now);
  return now.getHours() < DAY_ROLLOVER_HOUR ? addDays(today, -1) : today;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => (date: string) =>
  new Intl.DateTimeFormat("en-AU", { ...opts, timeZone: "UTC" }).format(toUtc(date));

export const formatLong = fmt({ weekday: "long", day: "numeric", month: "long" });
export const formatShort = fmt({ weekday: "short", day: "numeric", month: "short" });
export const formatDayMonth = fmt({ day: "numeric", month: "short" });
export const formatWeekday = fmt({ weekday: "short" });

export function relativeDayLabel(date: string, today: string): string {
  const diff = diffDays(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatShort(date);
}

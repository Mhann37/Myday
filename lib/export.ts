import { DAILY_COLUMNS, buildDays } from "./analytics";
import type { Entry } from "./schema";
import { enrichDays } from "./habit-analytics";
import { habitValue, type HabitData } from "./habits";

const cell = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  const raw = typeof v === "boolean" ? (v ? "1" : "0") : String(v);
  // User-written notes and names must not execute as spreadsheet formulas.
  const s = typeof v === "string" && /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** One row per day, one column per indicator. Best for spreadsheets and analysis. */
export function dailyCsv(entries: Entry[], habits?: HabitData): string {
  const diary = buildDays(entries);
  const days = enrichDays(diary, habits ?? null);
  return toCsv(
    [
      ...DAILY_COLUMNS.map((c) => c.key),
      ...(habits?.habits.map((h) => `habit.${h.id}.${h.name}`) ?? []),
    ],
    days.map((d) => [
      ...DAILY_COLUMNS.map((c) => c.get(d)),
      ...(habits?.habits.map((h) =>
        d.date < h.createdDate
          ? undefined
          : habitValue(h, d.date, habits.logs, diary),
      ) ?? []),
    ]),
  );
}

export function habitsCsv(data: HabitData): string {
  const names = new Map(data.habits.map((h) => [h.id, h]));
  return toCsv(
    [
      "date",
      "habit_id",
      "habit",
      "value",
      "unit",
      "current_target",
      "updated_at",
    ],
    data.logs.map((l) => {
      const habit = names.get(l.habitId);
      return [
        l.date,
        l.habitId,
        habit?.name,
        l.value,
        habit?.unit,
        habit?.target,
        l.updatedAt,
      ];
    }),
  );
}

type Flat = Record<string, string | number | boolean>;

function flatten(value: unknown, prefix: string, out: Flat) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    out[prefix] =
      value.length === 0
        ? ""
        : value
            .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
            .join("|");
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value))
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = value as string | number | boolean;
  }
}

/** One row per check-in with every raw field flattened (e.g. kids.harvey.behaviour). */
export function rawCsv(entries: Entry[]): string {
  const rows = entries.map((e) => {
    const flat: Flat = {};
    flatten(e.data, "", flat);
    return { date: e.date, period: e.period, ...flat };
  });
  const cols = [
    "date",
    "period",
    ...[...new Set(rows.flatMap((r) => Object.keys(r)))]
      .filter((k) => k !== "date" && k !== "period")
      .sort(),
  ];
  return toCsv(
    cols,
    rows.map((r) => cols.map((c) => (r as Record<string, unknown>)[c])),
  );
}

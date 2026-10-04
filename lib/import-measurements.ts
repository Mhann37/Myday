import { z } from "zod";
import { dateSchema } from "./schema";
import {
  maxHabitValue,
  type Habit,
  type HabitData,
  habitValue,
} from "./habits";
import type { DayRecord } from "./analytics";
export const measurementsSchema = z
  .array(
    z.object({
      date: dateSchema,
      value: z.number().min(0).max(100000),
      source: z.string().trim().min(1).max(80).default("CSV import"),
    }),
  )
  .min(1)
  .max(500);
export type Measurement = z.infer<typeof measurementsSchema>[number];
/** Small strict CSV dialect: date,value[,source]. Reject malformed quoted rows. */
export function parseMeasurements(text: string): Measurement[] {
  if (text.length > 100000)
    throw new Error("Choose a CSV smaller than 100 KB.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const flush = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("Invalid CSV quoting.");
      quoted = true;
    } else if (c === ",") {
      flush();
    } else if (c === "\n") {
      flush();
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else if (c === "\r") {
      if (text[i + 1] !== "\n")
        throw new Error("Use standard CSV line endings.");
    } else {
      if (closed && c.trim()) throw new Error("Invalid CSV quoting.");
      cell += c;
    }
  }
  if (quoted) throw new Error("Invalid CSV quoting.");
  flush();
  if (row.some((x) => x.trim())) rows.push(row);
  const header = rows.shift()?.map((x) =>
    x
      .trim()
      .toLowerCase()
      .replace(/^\uFEFF/, ""),
  );
  if (
    !header ||
    header[0] !== "date" ||
    header[1] !== "value" ||
    (header.length === 3 && header[2] !== "source") ||
    header.length < 2 ||
    header.length > 3
  )
    throw new Error(
      "Use columns date,value and optional source. Dates must be YYYY-MM-DD; use the habit’s displayed unit.",
    );
  const parsed = measurementsSchema.safeParse(
    rows.map((r) => {
      if (r.length !== header.length || !r[1]?.trim())
        throw new Error("Every row needs a date and numerical value.");
      return {
        date: r[0].trim(),
        value: Number(r[1]),
        source: r[2]?.trim() || "CSV import",
      };
    }),
  );
  if (!parsed.success)
    throw new Error("Check dates and values; import at most 500 rows.");
  if (new Set(parsed.data.map((r) => r.date)).size !== parsed.data.length)
    throw new Error("Include only one reading per date.");
  return parsed.data;
}
export function previewMeasurements(
  rows: Measurement[],
  habit: Habit,
  data: HabitData,
  days: DayRecord[],
  today: string,
) {
  return rows.map((r) => {
    const reason =
      r.date > today
        ? "Future date"
        : r.date < habit.createdDate
          ? "Before habit started"
          : r.value > maxHabitValue(habit) ||
              (habit.kind === "check" && r.value !== 0 && r.value !== 1)
            ? "Outside supported range"
            : habitValue(habit, r.date, data.logs, days) !== undefined ||
                data.logs.some(
                  (l) => l.habitId === habit.id && l.date === r.date,
                )
              ? "Existing record kept"
              : null;
    return { ...r, reason };
  });
}

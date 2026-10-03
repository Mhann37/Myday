import { DAILY_COLUMNS, buildDays } from "./analytics";
import type { Entry } from "./schema";

const cell = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  const s = typeof v === "boolean" ? (v ? "1" : "0") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** One row per day, one column per indicator. Best for spreadsheets and analysis. */
export function dailyCsv(entries: Entry[]): string {
  const days = buildDays(entries);
  return toCsv(
    DAILY_COLUMNS.map((c) => c.key),
    days.map((d) => DAILY_COLUMNS.map((c) => c.get(d))),
  );
}

type Flat = Record<string, string | number | boolean>;

function flatten(value: unknown, prefix: string, out: Flat) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    out[prefix] =
      value.length === 0
        ? ""
        : value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("|");
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
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
  const cols = ["date", "period", ...[...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== "date" && k !== "period").sort()];
  return toCsv(
    cols,
    rows.map((r) => cols.map((c) => (r as Record<string, unknown>)[c])),
  );
}

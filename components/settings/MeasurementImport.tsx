"use client";
import { useState } from "react";
import { useHabits, logHabit } from "@/lib/habit-client";
import { useEntries, useNow } from "@/lib/client";
import { buildDays } from "@/lib/analytics";
import {
  parseMeasurements,
  previewMeasurements,
  type Measurement,
} from "@/lib/import-measurements";
import { Card } from "../ui";
export function MeasurementImport() {
  const { data } = useHabits(),
    { entries } = useEntries(),
    now = useNow(),
    [habitId, setHabitId] = useState(""),
    [rows, setRows] = useState<Measurement[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (!data || !entries || !now) return null;
  const habit = data.habits.find((h) => h.id === habitId),
    preview = habit
      ? previewMeasurements(rows, habit, data, buildDays(entries), now.today)
      : [],
    ready = preview.filter((r) => !r.reason);
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">
        Bring in your measurements
      </h2>
      <p className="mt-2 text-sm text-ink-2">
        Import steps, sleep, workouts or another habit from a CSV. Existing
        diary and quick-log values are kept.
      </p>
      <label className="mt-3 block text-sm font-semibold">
        Habit to update
        <select
          aria-label="Import habit"
          disabled={busy}
          className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3"
          value={habitId}
          onChange={(e) => {
            setHabitId(e.target.value);
            setRows([]);
            setNotice("");
          }}
        >
          <option value="">Choose a habit</option>
          {data.habits
            .filter((h) => !h.archived)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.unit ? ` (${h.unit})` : ""}
              </option>
            ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted">
        Use columns date,value,source. Example: 2026-10-04,8500,Watch export.
        Use YYYY-MM-DD and the selected habit’s units; workouts use 1 for done
        or 0 for not done. Up to 500 daily readings.
      </p>
      <label className="secondary-button mt-3 cursor-pointer">
        Choose measurement CSV
        <input
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          disabled={!habit || busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            setNotice("");
            setRows([]);
            try {
              if (file.size > 100000)
                throw new Error("Choose a CSV smaller than 100 KB.");
              setRows(parseMeasurements(await file.text()));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </label>
      {preview.length > 0 && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <p className="text-sm font-semibold">
            {ready.length} new readings · {preview.length - ready.length}{" "}
            skipped
          </p>
          <details className="mt-2 text-xs">
            <summary className="min-h-11 cursor-pointer">
              Review readings
            </summary>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Value</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.date}>
                      <td className="py-2">{r.date}</td>
                      <td>{r.value}</td>
                      <td>{r.reason ?? "Add"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <button
            className="primary-button mt-3"
            disabled={busy || !ready.length}
            onClick={async () => {
              setBusy(true);
              setError("");
              let n = 0;
              try {
                for (const r of ready) {
                  await logHabit(habitId, r.date, r.value, "logged", r.source);
                  n++;
                }
                setRows([]);
                setNotice(
                  `${n} measurements recorded. Their source is included in exports.`,
                );
              } catch (e) {
                setError(
                  `${n} readings saved before the import stopped. ${(e as Error).message} Review sync status before retrying.`,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Import new readings
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-good">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </Card>
  );
}

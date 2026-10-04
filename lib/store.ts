import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import type { Entry, EntryData, Period } from "./schema";
import type { Habit, HabitData } from "./habits";
import type { Backup, RestoreResult } from "./backup";

// Production: Neon Postgres (DATABASE_URL, injected by the Vercel integration).
// Local development without a database: a JSON file in .data/ so the app can be
// run and tried out immediately. The file store refuses to run on Vercel.

export interface Store {
  list(): Promise<Entry[]>;
  upsert(date: string, period: Period, data: EntryData): Promise<Entry>;
  remove(date: string, period: Period): Promise<void>;
  recentFailures(windowMs: number): Promise<number>;
  recordFailure(): Promise<void>;
  clearFailures(): Promise<void>;
  listHabits(): Promise<HabitData>;
  upsertHabit(habit: Habit): Promise<void>;
  logHabit(habitId: string, date: string, value: number | null): Promise<void>;
  restoreBackup(backup: Backup): Promise<RestoreResult>;
}

// ---------------------------------------------------------------- Postgres

export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS entries (
     entry_date text NOT NULL,
     period     text NOT NULL CHECK (period IN ('morning', 'night')),
     data       jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (entry_date, period)
   )`,
  `CREATE TABLE IF NOT EXISTS auth_failures (
     id bigserial PRIMARY KEY,
     at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS habits (id text PRIMARY KEY, data jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS habit_logs (
     habit_id text NOT NULL REFERENCES habits(id), log_date text NOT NULL,
     value numeric NOT NULL CHECK (value >= 0), updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (habit_id, log_date)
   )`,
];

export const SQL = {
  list: `SELECT entry_date, period, data, updated_at FROM entries ORDER BY entry_date ASC, period DESC`,
  upsert: `INSERT INTO entries (entry_date, period, data)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (entry_date, period)
           DO UPDATE SET data = EXCLUDED.data, updated_at = now()
           RETURNING entry_date, period, data, updated_at`,
  remove: `DELETE FROM entries WHERE entry_date = $1 AND period = $2`,
  failures: `SELECT count(*)::int AS n FROM auth_failures WHERE at > now() - ($1 * interval '1 millisecond')`,
  addFailure: `INSERT INTO auth_failures DEFAULT VALUES`,
  clearFailures: `DELETE FROM auth_failures`,
};

interface Row {
  entry_date: string;
  period: Period;
  data: EntryData;
  updated_at: string | Date;
}

const toEntry = (r: Row): Entry => ({
  date: r.entry_date,
  period: r.period,
  data: r.data,
  updatedAt: new Date(r.updated_at).toISOString(),
});

type Query = (text: string, params?: unknown[]) => Promise<unknown[]>;

export function makePostgresStore(query: Query): Store {
  let ready: Promise<void> | null = null;
  const init = () => {
    ready ??= (async () => {
      for (const stmt of SCHEMA_SQL) await query(stmt);
    })().catch((err) => {
      ready = null;
      throw err;
    });
    return ready;
  };

  return {
    async list() {
      await init();
      return ((await query(SQL.list)) as Row[]).map(toEntry);
    },
    async upsert(date, period, data) {
      await init();
      const rows = (await query(SQL.upsert, [
        date,
        period,
        JSON.stringify(data),
      ])) as Row[];
      return toEntry(rows[0]);
    },
    async remove(date, period) {
      await init();
      await query(SQL.remove, [date, period]);
    },
    async recentFailures(windowMs) {
      await init();
      const rows = (await query(SQL.failures, [windowMs])) as { n: number }[];
      return rows[0]?.n ?? 0;
    },
    async recordFailure() {
      await init();
      await query(SQL.addFailure);
    },
    async clearFailures() {
      await init();
      await query(SQL.clearFailures);
    },
    async listHabits() {
      await init();
      const habits = (await query(
        `SELECT data FROM habits ORDER BY data->>'createdDate', id`,
      )) as { data: Habit }[];
      const logs = (await query(
        `SELECT habit_id, log_date, value, updated_at FROM habit_logs ORDER BY log_date`,
      )) as {
        habit_id: string;
        log_date: string;
        value: number | string;
        updated_at: string | Date;
      }[];
      return {
        habits: habits.map((h) => h.data),
        logs: logs.map((l) => ({
          habitId: l.habit_id,
          date: l.log_date,
          value: Number(l.value),
          updatedAt: new Date(l.updated_at).toISOString(),
        })),
      };
    },
    async upsertHabit(habit) {
      await init();
      await query(
        `INSERT INTO habits (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [habit.id, JSON.stringify(habit)],
      );
    },
    async logHabit(habitId, date, value) {
      await init();
      if (value === null)
        await query(
          `DELETE FROM habit_logs WHERE habit_id = $1 AND log_date = $2`,
          [habitId, date],
        );
      else
        await query(
          `INSERT INTO habit_logs (habit_id, log_date, value) VALUES ($1, $2, $3)
        ON CONFLICT (habit_id, log_date) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [habitId, date, value],
        );
    },
    async restoreBackup(backup) {
      await init();
      // One SQL statement: restore all three collections atomically, keeping existing records.
      const rows = (await query(
        `WITH
        restored_entries AS (
          INSERT INTO entries (entry_date, period, data)
          SELECT item->>'date', item->>'period', item->'data' FROM jsonb_array_elements($1::jsonb) AS item
          ON CONFLICT DO NOTHING RETURNING entry_date
        ), restored_habits AS (
          INSERT INTO habits (id, data)
          SELECT item->>'id', item FROM jsonb_array_elements($2::jsonb) AS item
          ON CONFLICT DO NOTHING RETURNING id
        ), restored_logs AS (
          INSERT INTO habit_logs (habit_id, log_date, value, updated_at)
          SELECT item->>'habitId', item->>'date', (item->>'value')::numeric, (item->>'updatedAt')::timestamptz
          FROM jsonb_array_elements($3::jsonb) AS item
          WHERE item->>'habitId' IN (SELECT id FROM restored_habits UNION SELECT id FROM habits)
          ON CONFLICT DO NOTHING RETURNING habit_id
        ) SELECT (SELECT count(*)::int FROM restored_entries) AS entries_added,
          (SELECT count(*)::int FROM restored_habits) AS habits_added,
          (SELECT count(*)::int FROM restored_logs) AS logs_added`,
        [
          JSON.stringify(backup.entries),
          JSON.stringify(backup.habits),
          JSON.stringify(backup.logs),
        ],
      )) as {
        entries_added: number;
        habits_added: number;
        logs_added: number;
      }[];
      return {
        entriesAdded: rows[0].entries_added,
        habitsAdded: rows[0].habits_added,
        logsAdded: rows[0].logs_added,
      };
    },
  };
}

// -------------------------------------------------------------- JSON file

interface FileShape {
  entries: Entry[];
  failures: number[];
  habits?: HabitData;
}

export const DEV_STORE_PATH = path.join(
  process.cwd(),
  ".data",
  "dev-store.json",
);

export function makeFileStore(file: string = DEV_STORE_PATH): Store {
  const read = async (): Promise<FileShape> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as FileShape;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { entries: [], failures: [], habits: { habits: [], logs: [] } };
    }
  };
  const write = async (s: FileShape) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(s, null, 2));
    await fs.rename(temp, file);
  };
  let pending: Promise<unknown> = Promise.resolve();
  const mutate = <T>(fn: (s: FileShape) => T): Promise<T> => {
    const operation = pending.then(async () => {
      const s = await read();
      const result = fn(s);
      await write(s);
      return result;
    });
    pending = operation.catch(() => {});
    return operation;
  };
  const sort = (a: Entry, b: Entry) =>
    a.date === b.date
      ? a.period < b.period
        ? 1
        : -1
      : a.date < b.date
        ? -1
        : 1;

  return {
    async list() {
      return (await read()).entries.sort(sort);
    },
    async upsert(date, period, data) {
      return mutate((s) => {
        const entry: Entry = {
          date,
          period,
          data,
          updatedAt: new Date().toISOString(),
        };
        s.entries = s.entries.filter(
          (e) => !(e.date === date && e.period === period),
        );
        s.entries.push(entry);
        return entry;
      });
    },
    async remove(date, period) {
      await mutate((s) => {
        s.entries = s.entries.filter(
          (e) => !(e.date === date && e.period === period),
        );
      });
    },
    async recentFailures(windowMs) {
      const cutoff = Date.now() - windowMs;
      return (await read()).failures.filter((t) => t > cutoff).length;
    },
    async recordFailure() {
      await mutate((s) => {
        s.failures.push(Date.now());
      });
    },
    async clearFailures() {
      await mutate((s) => {
        s.failures = [];
      });
    },
    async listHabits() {
      return (await read()).habits ?? { habits: [], logs: [] };
    },
    async upsertHabit(habit) {
      await mutate((s) => {
        s.habits ??= { habits: [], logs: [] };
        s.habits.habits = [
          ...s.habits.habits.filter((h) => h.id !== habit.id),
          habit,
        ];
      });
    },
    async logHabit(habitId, date, value) {
      await mutate((s) => {
        s.habits ??= { habits: [], logs: [] };
        if (!s.habits.habits.some((h) => h.id === habitId))
          throw new Error("Habit not found");
        s.habits.logs = s.habits.logs.filter(
          (l) => !(l.habitId === habitId && l.date === date),
        );
        if (value !== null)
          s.habits.logs.push({
            habitId,
            date,
            value,
            updatedAt: new Date().toISOString(),
          });
      });
    },
    async restoreBackup(backup) {
      return mutate((s) => {
        s.habits ??= { habits: [], logs: [] };
        const result = { entriesAdded: 0, habitsAdded: 0, logsAdded: 0 };
        for (const e of backup.entries)
          if (
            !s.entries.some((x) => x.date === e.date && x.period === e.period)
          ) {
            s.entries.push({ ...e, updatedAt: new Date().toISOString() });
            result.entriesAdded++;
          }
        for (const h of backup.habits)
          if (!s.habits.habits.some((x) => x.id === h.id)) {
            s.habits.habits.push(h);
            result.habitsAdded++;
          }
        for (const l of backup.logs)
          if (
            !s.habits.logs.some(
              (x) => x.habitId === l.habitId && x.date === l.date,
            )
          ) {
            s.habits.logs.push(l);
            result.logsAdded++;
          }
        return result;
      });
    },
  };
}

// ---------------------------------------------------------------- selector

let instance: Store | null = null;

export function getStore(): Store {
  if (instance) return instance;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (url) {
    const sql = neon(url);
    instance = makePostgresStore(
      (text, params) => sql.query(text, params ?? []) as Promise<unknown[]>,
    );
  } else if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL is not set. In Vercel, open Storage, create a Neon database and connect it to this project, then redeploy.",
    );
  } else {
    instance = makeFileStore(
      process.env.MYDAY_DEV_STORE_PATH || DEV_STORE_PATH,
    );
  }
  return instance;
}

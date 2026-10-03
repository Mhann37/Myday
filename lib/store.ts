import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import type { Entry, EntryData, Period } from "./schema";

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
      const rows = (await query(SQL.upsert, [date, period, JSON.stringify(data)])) as Row[];
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
  };
}

// -------------------------------------------------------------- JSON file

interface FileShape {
  entries: Entry[];
  failures: number[];
}

export const DEV_STORE_PATH = path.join(process.cwd(), ".data", "dev-store.json");

export function makeFileStore(file: string = DEV_STORE_PATH): Store {
  const read = async (): Promise<FileShape> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as FileShape;
    } catch {
      return { entries: [], failures: [] };
    }
  };
  const write = async (s: FileShape) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(s, null, 2));
  };
  const sort = (a: Entry, b: Entry) =>
    a.date === b.date ? (a.period < b.period ? 1 : -1) : a.date < b.date ? -1 : 1;

  return {
    async list() {
      return (await read()).entries.sort(sort);
    },
    async upsert(date, period, data) {
      const s = await read();
      const entry: Entry = { date, period, data, updatedAt: new Date().toISOString() };
      s.entries = s.entries.filter((e) => !(e.date === date && e.period === period));
      s.entries.push(entry);
      await write(s);
      return entry;
    },
    async remove(date, period) {
      const s = await read();
      s.entries = s.entries.filter((e) => !(e.date === date && e.period === period));
      await write(s);
    },
    async recentFailures(windowMs) {
      const cutoff = Date.now() - windowMs;
      return (await read()).failures.filter((t) => t > cutoff).length;
    },
    async recordFailure() {
      const s = await read();
      s.failures.push(Date.now());
      await write(s);
    },
    async clearFailures() {
      const s = await read();
      s.failures = [];
      await write(s);
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
    instance = makeFileStore();
  }
  return instance;
}

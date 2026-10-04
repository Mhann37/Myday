import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { addDays, diffDays, logicalToday, weekdayIndex } from "../lib/dates";
import { putEntrySchema } from "../lib/schema";
import {
  SESSION_MAX_AGE,
  checkPasscode,
  createSessionToken,
  verifySessionToken,
} from "../lib/session";
import { makeFileStore, makePostgresStore, type Store } from "../lib/store";

// ---------------------------------------------------------------- dates

test("date arithmetic is immune to daylight-saving shifts", () => {
  assert.equal(addDays("2026-10-04", 1), "2026-10-05"); // AU DST starts
  assert.equal(addDays("2026-04-05", 1), "2026-04-06"); // AU DST ends
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(diffDays("2026-10-05", "2026-10-03"), 2);
  assert.equal(weekdayIndex("2026-03-02"), 0); // Monday
  assert.equal(weekdayIndex("2026-03-08"), 6); // Sunday
});

test("a check-in at 1am belongs to the previous day", () => {
  assert.equal(logicalToday(new Date(2026, 2, 10, 1, 30)), "2026-03-09");
  assert.equal(logicalToday(new Date(2026, 2, 10, 4, 0)), "2026-03-10");
  assert.equal(logicalToday(new Date(2026, 2, 10, 23, 59)), "2026-03-10");
});

// -------------------------------------------------------------- sessions

test("session tokens verify, expire, and reject tampering", async () => {
  process.env.APP_PASSCODE = "correct horse";
  process.env.AUTH_SECRET = "s3cret";
  const now = Date.UTC(2026, 0, 1);
  const token = await createSessionToken(now);

  assert.equal(await verifySessionToken(token, now + 1000), true);
  assert.equal(
    await verifySessionToken(token, now + (SESSION_MAX_AGE + 5) * 1000),
    false,
  );
  assert.equal(await verifySessionToken(undefined, now), false);
  assert.equal(await verifySessionToken("garbage", now), false);

  const [exp, sig] = token.split(".");
  assert.equal(
    await verifySessionToken(`${Number(exp) + 1000}.${sig}`, now),
    false,
  );
  const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
  assert.equal(await verifySessionToken(`${exp}.${flipped}`, now), false);

  process.env.APP_PASSCODE = "a different passcode";
  assert.equal(
    await verifySessionToken(token, now + 1000),
    false,
    "changing the passcode signs everyone out",
  );
});

test("passcode comparison", async () => {
  process.env.APP_PASSCODE = "correct horse";
  assert.equal(await checkPasscode("correct horse"), true);
  assert.equal(await checkPasscode("correct hors"), false);
  assert.equal(await checkPasscode(""), false);
  delete process.env.APP_PASSCODE;
  assert.equal(await checkPasscode(""), false);
});

// ---------------------------------------------------------------- schema

test("entry schema accepts a full entry and rejects bad ones", () => {
  const ok = putEntrySchema.safeParse({
    date: "2026-03-10",
    period: "night",
    data: {
      me: { mood: 4 },
      kids: { harvey: { behaviour: 3, tags: ["great"] } },
      meds: { taken: [] },
      habits: { junk: 2 },
    },
  });
  assert.ok(ok.success);
  assert.equal(
    putEntrySchema.safeParse({ date: "10/03/2026", period: "night", data: {} })
      .success,
    false,
  );
  assert.equal(
    putEntrySchema.safeParse({ date: "2026-03-10", period: "noon", data: {} })
      .success,
    false,
  );
  assert.equal(
    putEntrySchema.safeParse({
      date: "2026-03-10",
      period: "night",
      data: { me: { mood: 9 } },
    }).success,
    false,
  );
  const stripped = putEntrySchema.parse({
    date: "2026-03-10",
    period: "night",
    data: { notes: "x", evil: "y" },
  });
  assert.deepEqual(stripped.data, { notes: "x" });
});

// ----------------------------------------------------------------- stores

async function exerciseStore(store: Store) {
  assert.deepEqual(await store.list(), []);

  const a = await store.upsert("2026-03-10", "night", {
    me: { mood: 3 },
    meds: { taken: [] },
  });
  assert.equal(a.date, "2026-03-10");
  await store.upsert("2026-03-10", "morning", { sleep: { hours: 7.5 } });
  await store.upsert("2026-03-09", "night", { notes: "earlier" });

  // upsert replaces in place, it doesn't duplicate
  await store.upsert("2026-03-10", "night", {
    me: { mood: 5 },
    kids: { leni: { behaviour: 4 } },
  });
  const rows = await store.list();
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => `${r.date}:${r.period}`),
    ["2026-03-09:night", "2026-03-10:night", "2026-03-10:morning"],
  );
  const night = rows.find(
    (r) => r.date === "2026-03-10" && r.period === "night",
  )!;
  assert.deepEqual(night.data, {
    me: { mood: 5 },
    kids: { leni: { behaviour: 4 } },
  });
  assert.match(night.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  await store.remove("2026-03-10", "morning");
  assert.equal((await store.list()).length, 2);

  // login throttling
  assert.equal(await store.recentFailures(60_000), 0);
  await store.recordFailure();
  await store.recordFailure();
  assert.equal(await store.recentFailures(60_000), 2);
  await store.clearFailures();
  assert.equal(await store.recentFailures(60_000), 0);

  const { starterHabit } = await import("../lib/habits");
  const habit = starterHabit("water", "2026-03-01");
  await store.upsertHabit(habit);
  await store.logHabit(habit.id, "2026-03-10", 5);
  await store.logHabit(habit.id, "2026-03-10", 8);
  assert.equal((await store.listHabits()).logs.length, 1);
  assert.equal((await store.listHabits()).logs[0].value, 8);
  await store.upsertHabit({ ...habit, archived: true });
  assert.equal((await store.listHabits()).habits[0].archived, true);
  assert.equal(
    (await store.listHabits()).logs.length,
    1,
    "archiving preserves history",
  );
  await store.logHabit(habit.id, "2026-03-10", null);
  assert.equal((await store.listHabits()).logs.length, 0);
  const reading = starterHabit("custom", "2026-03-01");
  const backup = {
    entries: [
      {
        date: "2026-03-10",
        period: "night" as const,
        data: { me: { mood: 1 } },
      },
      {
        date: "2026-03-15",
        period: "morning" as const,
        data: { sleep: { hours: 8 } },
      },
    ],
    habits: [{ ...habit, archived: false }, reading],
    logs: [
      {
        habitId: reading.id,
        date: "2026-03-15",
        value: 1,
        updatedAt: "2026-03-15T18:00:00Z",
      },
    ],
  };
  assert.deepEqual(await store.restoreBackup(backup), {
    entriesAdded: 1,
    habitsAdded: 1,
    logsAdded: 1,
  });
  assert.deepEqual(
    await store.restoreBackup(backup),
    { entriesAdded: 0, habitsAdded: 0, logsAdded: 0 },
    "reimporting is safe",
  );
  assert.equal(
    (await store.list()).find(
      (e) => e.date === "2026-03-10" && e.period === "night",
    )?.data.me?.mood,
    5,
    "current answers survive restoration",
  );
  assert.equal(
    (await store.listHabits()).habits.find((h) => h.id === habit.id)?.archived,
    true,
    "current habit settings survive restoration",
  );
}

test("postgres store (SQL run against a real Postgres via PGlite)", async () => {
  const db = new PGlite();
  const store = makePostgresStore(
    async (text, params) => (await db.query(text, params ?? [])).rows,
  );
  await exerciseStore(store);

  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO entries (entry_date, period) VALUES ('2026-01-01', 'noon')`,
      ),
    "period is constrained",
  );
  await db.close();
});

test("file store (local development)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "myday-"));
  await exerciseStore(makeFileStore(path.join(dir, "store.json")));
});

test("concurrent local saves don't lose independent entries", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "myday-concurrent-"));
  const store = makeFileStore(path.join(dir, "store.json"));
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      store.upsert(addDays("2026-03-01", i), "night", { me: { mood: 4 } }),
    ),
  );
  assert.equal((await store.list()).length, 12);
});

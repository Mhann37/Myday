import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeFileStore, makePostgresStore, type Store } from "../lib/store";
import { ConflictError, type Mutation } from "../lib/workspace";
import {
  starterHabit,
  preserveGoals,
  goalOn,
  habitWeek,
  habitStreak,
  habitValue,
} from "../lib/habits";
import { buildDays } from "../lib/analytics";
import { enrichDays } from "../lib/habit-analytics";
import {
  dueReminders,
  quiet,
  zoned,
  type ReminderSettings,
} from "../lib/reminders";
import {
  parseMeasurements,
  previewMeasurements,
} from "../lib/import-measurements";
import { experimentSummary, type Experiment } from "../lib/experiments";
import { DEFAULT_PREFERENCES } from "../lib/preferences";

async function versionedStore(store: Store) {
  const habit = starterHabit("water", "2026-10-01"),
    h: Mutation = {
      kind: "habit",
      key: `habit:${habit.id}`,
      id: crypto.randomUUID(),
      expected: null,
      data: habit,
      effectiveFrom: "2026-10-01",
    };
  await store.writeRecord(h.key, h.data, null, h.id, h);
  const a: Mutation = {
    kind: "log",
    key: `log:${habit.id}:2026-10-04`,
    id: crypto.randomUUID(),
    expected: null,
    data: {
      habitId: habit.id,
      date: "2026-10-04",
      value: 8,
      status: "logged",
      source: "manual",
    },
  };
  await store.writeRecord(a.key, a.data, a.expected, a.id, a);
  assert.equal((await store.listHabits()).logs[0].value, 8);
  const b: Mutation = {
    ...a,
    id: crypto.randomUUID(),
    expected: a.id,
    data: { ...a.data, value: 5 },
  };
  await store.writeRecord(b.key, b.data, b.expected, b.id, b);
  // A repeated older operation must not roll a newer save back.
  await store.writeRecord(a.key, a.data, a.expected, a.id, a);
  assert.equal((await store.listHabits()).logs[0].value, 5);
  await assert.rejects(
    () =>
      store.writeRecord(
        a.key,
        { ...a.data, value: 2 },
        a.id,
        crypto.randomUUID(),
        a,
      ),
    ConflictError,
  );
  assert.equal((await store.listHabits()).logs[0].value, 5);
  const cleared: Mutation = {
    ...b,
    id: crypto.randomUUID(),
    expected: b.id,
    data: { ...b.data, value: null },
  };
  await store.writeRecord(
    cleared.key,
    cleared.data,
    cleared.expected,
    cleared.id,
    cleared,
  );
  assert.equal((await store.listHabits()).logs.length, 0);
  assert.equal(
    (await store.listRecords()).find((r) => r.key === cleared.key)?.revision,
    cleared.id,
    "deletions retain a version",
  );
  const excused: Mutation = {
    ...b,
    id: crypto.randomUUID(),
    expected: cleared.id,
    data: { ...b.data, value: 0, status: "excused" },
  };
  await store.writeRecord(
    excused.key,
    excused.data,
    excused.expected,
    excused.id,
    excused,
  );
  assert.equal((await store.listHabits()).logs[0].status, "excused");
  const entry: Mutation = {
    kind: "entry",
    key: "entry:2026-10-04:night",
    id: crypto.randomUUID(),
    expected: null,
    data: { date: "2026-10-04", period: "night", data: { me: { energy: 4 } } },
  };
  await store.writeRecord(
    entry.key,
    entry.data,
    entry.expected,
    entry.id,
    entry,
  );
  assert.equal((await store.list())[0].data.me?.energy, 4);
  const deletion: Mutation = {
    ...entry,
    id: crypto.randomUUID(),
    expected: entry.id,
    data: null,
  };
  await store.writeRecord(
    deletion.key,
    null,
    deletion.expected,
    deletion.id,
    deletion,
  );
  assert.equal((await store.list()).length, 0);
  const restored = {
    entries: [
      {
        date: "2026-10-04",
        period: "night" as const,
        data: { me: { energy: 3 } },
      },
    ],
    habits: [],
    logs: [],
    records: [
      {
        kind: "preferences" as const,
        key: "preferences" as const,
        data: DEFAULT_PREFERENCES,
      },
    ],
  };
  await store.restoreBackup(restored);
  assert.notEqual(
    (await store.listRecords()).find((r) => r.key === entry.key)?.revision,
    deletion.id,
    "restore invalidates stale record versions",
  );
  assert.equal(
    (await store.listRecords()).find((r) => r.key === "preferences")?.data !==
      undefined,
    true,
  );
  const snapshot = await store.snapshot();
  assert.equal(snapshot.entries[0].data.me?.energy, 3);
  assert.equal(snapshot.habitData.logs[0].status, "excused");
  assert.equal(
    snapshot.records.find((r) => r.key === "preferences")?.data !== undefined,
    true,
  );
  const expected = (await store.listRecords()).find(
    (r) => r.key === entry.key,
  )!.revision;
  const writes = await Promise.allSettled(
    [4, 5].map((energy) => {
      const m = {
        ...entry,
        id: crypto.randomUUID(),
        expected,
        data: {
          date: "2026-10-04",
          period: "night" as const,
          data: { me: { energy } },
        },
      };
      return store.writeRecord(m.key, m.data, m.expected, m.id, m);
    }),
  );
  assert.equal(
    writes.filter((x) => x.status === "fulfilled").length,
    1,
    "only one competing edit succeeds",
  );
}
test("atomic Postgres compare-and-swap, replay, tombstones, competing edits and restore", async () => {
  const db = new PGlite();
  try {
    await versionedStore(
      makePostgresStore(async (q, p) => (await db.query(q, p ?? [])).rows),
    );
  } finally {
    await db.close();
  }
});
test("file store follows the same version and replay protocol", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "myday-cas-"));
  await versionedStore(makeFileStore(path.join(dir, "db.json")));
});
test("goal changes preserve historical achievements; pauses and excused logs are not failures or analytic zeroes", () => {
  const initial = starterHabit("water", "2026-10-01"),
    updated = preserveGoals(initial, { ...initial, target: 10 }, "2026-10-05");
  assert.equal(goalOn(updated, "2026-10-04").target, 8);
  assert.equal(goalOn(updated, "2026-10-05").target, 10);
  const logs = [
    {
      habitId: initial.id,
      date: "2026-10-04",
      value: 8,
      updatedAt: "2026-10-04T00:00:00Z",
    },
    {
      habitId: initial.id,
      date: "2026-10-03",
      value: 0,
      status: "excused" as const,
      updatedAt: "2026-10-03T00:00:00Z",
    },
  ];
  const h = {
    ...updated,
    pauses: [{ from: "2026-10-01", to: "2026-10-02", reason: "illness" }],
  };
  assert.equal(habitWeek(h, "2026-10-04", logs, []).goal, 1);
  assert.equal(habitWeek(h, "2026-10-04", logs, []).completed, 1);
  assert.equal(habitStreak(h, "2026-10-04", logs, []), 1);
  assert.equal(habitValue(h, "2026-10-03", logs, []), undefined);
  const days = enrichDays([], { habits: [h], logs });
  assert.equal(days.find((d) => d.date === "2026-10-03")?.water, undefined);
});
const device: ReminderSettings = {
  id: crypto.randomUUID(),
  enabled: true,
  timezone: "Australia/Sydney",
  quietStart: "22:00",
  quietEnd: "07:00",
  subscription: {
    endpoint: "https://example.com/push",
    keys: { p256dh: "x", auth: "x" },
  },
  reminders: [
    {
      id: crypto.randomUUID(),
      label: "Morning",
      time: "08:00",
      habitId: null,
      period: "morning",
    },
  ],
};
test("reminders use wall-clock timezone across DST, honour quiet hours and suppress completion", () => {
  assert.equal(
    zoned(new Date("2026-10-03T22:00:00Z"), "Australia/Sydney").minute,
    540,
  );
  assert.equal(
    zoned(new Date("2026-10-02T22:00:00Z"), "Australia/Sydney").minute,
    480,
  );
  assert.equal(quiet(23 * 60, "22:00", "07:00"), true);
  assert.equal(quiet(8 * 60, "22:00", "07:00"), false);
  const now = new Date("2026-10-03T21:03:00Z"),
    empty = { habits: [], logs: [] };
  assert.equal(dueReminders(device, now, [], empty).length, 1);
  assert.equal(
    dueReminders(
      device,
      now,
      [
        {
          date: "2026-10-04",
          period: "morning",
          data: { me: { energy: 4 } },
          updatedAt: now.toISOString(),
        },
      ],
      empty,
    ).length,
    0,
  );
  assert.equal(
    dueReminders(device, new Date("2026-10-03T21:11:00Z"), [], empty).length,
    0,
  );
});
test("imports reject ambiguous dates, duplicate days and malformed values; preserve existing measurements", () => {
  const readings = parseMeasurements(
    'date,value,source\r\n2026-10-03,8500,"Watch, daily"\r\n',
  );
  assert.equal(readings[0].source, "Watch, daily");
  for (const csv of [
    "date,value\n03/10/2026,8",
    "date,value\n2026-10-03,",
    "date,value\n2026-10-03,8\n2026-10-03,9",
    'date,value\n2026-10-03,"8',
  ])
    assert.throws(() => parseMeasurements(csv));
  const h = starterHabit("steps", "2026-10-01"),
    days = buildDays([
      {
        date: "2026-10-03",
        period: "night",
        data: { habits: { steps: 10000 } },
        updatedAt: "2026-10-03T00:00:00Z",
      },
    ]);
  assert.equal(
    previewMeasurements(
      readings,
      h,
      { habits: [h], logs: [] },
      days,
      "2026-10-04",
    )[0].reason,
    "Existing record kept",
  );
});
test("experiment comparisons remain inconclusive with sparse data and exclude unrecorded outcomes", () => {
  const e: Experiment = {
    id: crypto.randomUUID(),
    action: "Walk after lunch",
    habitId: null,
    outcome: "energy",
    start: "2026-10-01",
    reviewDate: "2026-10-15",
    baselineFrom: "2026-09-17",
    decision: null,
    reflection: "",
    reviewedAt: null,
  };
  const days = buildDays([
    {
      date: "2026-09-30",
      period: "night",
      data: { me: { energy: 2 } },
      updatedAt: "2026-09-30T00:00:00Z",
    },
    {
      date: "2026-10-01",
      period: "night",
      data: { me: { mood: 5 } },
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ]);
  const result = experimentSummary(
    e,
    days,
    { habits: [], logs: [] },
    "2026-10-04",
  );
  assert.equal(result.before.n, 1);
  assert.equal(result.after.n, 0);
  assert.equal(result.delta, undefined);
});

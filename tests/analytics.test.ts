import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDays,
  computeInsights,
  currentStreak,
  pickInsights,
  rollingMean,
  weekdayPattern,
} from "../lib/analytics";
import { carriedInjuries, progress, prune } from "../lib/checkin";
import { dailyCsv, rawCsv } from "../lib/export";
import {
  generateDemoEntries,
  generateNoiseEntries,
} from "../scripts/demo-data";
import { benjaminiHochberg, compareGroups, tTestP } from "../lib/stats";
import type { Entry } from "../lib/schema";

const END = "2026-09-30";
const demo = generateDemoEntries(END, 75);

test("buildDays keeps unanswered questions as missing, never zero", () => {
  const entries: Entry[] = [
    {
      date: "2026-01-01",
      period: "night",
      data: { me: { mood: 4 }, training: { lifted: false } },
      updatedAt: "",
    },
  ];
  const [d] = buildDays(entries);
  assert.equal(d.moodPm, 4);
  assert.equal(d.lifted, false);
  assert.equal(d.cardio, undefined);
  assert.equal(
    d.exercised,
    undefined,
    "an unanswered cardio question is not a no",
  );
  assert.equal(d.alcohol, undefined);
  assert.equal(d.panadol, undefined);
  assert.equal(d.sleepHours, undefined);
  assert.equal(d.energy, undefined);
});

test("day score combines mood, energy and inverted stress", () => {
  const best = buildDays([
    {
      date: "2026-01-01",
      period: "night",
      data: { me: { mood: 5, energy: 5, stress: 1 } },
      updatedAt: "",
    },
  ])[0];
  const worst = buildDays([
    {
      date: "2026-01-02",
      period: "night",
      data: { me: { mood: 1, energy: 1, stress: 5 } },
      updatedAt: "",
    },
  ])[0];
  assert.equal(best.wellbeing, 100);
  assert.equal(worst.wellbeing, 0);
});

test("empty meds list means 'none taken', absent means unknown", () => {
  const [a, b] = buildDays([
    {
      date: "2026-01-01",
      period: "night",
      data: { meds: { taken: [] } },
      updatedAt: "",
    },
    { date: "2026-01-02", period: "night", data: {}, updatedAt: "" },
  ]);
  assert.equal(a.painMed, false);
  assert.equal(b.painMed, undefined);
});

test("insights engine finds the planted effects", () => {
  const insights = computeInsights(buildDays(demo));
  const find = (id: string) => insights.find((i) => i.id === id);

  const lifting = find("lifted:mood");
  assert.ok(lifting, "lifting -> end-of-day mood should be detected");
  assert.ok(
    lifting.diff > 0.3 && lifting.good,
    `expected a clear positive effect, got ${lifting.diff}`,
  );

  const booze = find("alcohol:nextSleepQ");
  assert.ok(booze, "alcohol -> that night's sleep quality should be detected");
  assert.ok(
    booze.diff < -0.3 && !booze.good && booze.lag === 1,
    `expected a negative next-day effect, got ${booze.diff}`,
  );

  const kids = find("highStress:kids");
  assert.ok(
    kids && kids.diff < 0,
    "high stress -> rougher kids' behaviour should be detected",
  );

  const { helps, hurts } = pickInsights(insights);
  assert.ok(helps.length > 0 && hurts.length > 0);
});

test("insights stay quiet with too little data", () => {
  const few = buildDays(generateDemoEntries(END, 6));
  assert.deepEqual(computeInsights(few), []);
});

test("insights don't invent patterns from pure noise", () => {
  // Every indicator is random and independent, so anything reported is a false
  // discovery. At a 15% false-discovery cut-off about 15% of noise datasets may
  // show something (that is what the cut-off means), and a "solid" label, which
  // needs q <= 1%, should be rare. Bounds below leave room for sampling error.
  const RUNS = 300;
  let any = 0;
  let solid = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    const found = computeInsights(
      buildDays(generateNoiseEntries(END, 75, seed)),
    );
    if (found.length) any++;
    if (found.some((i) => i.confidence === "solid")) solid++;
  }
  assert.ok(
    any / RUNS <= 0.25,
    `${any}/${RUNS} noise datasets produced findings`,
  );
  assert.ok(
    solid / RUNS <= 0.04,
    `${solid}/${RUNS} noise datasets produced a "solid" finding`,
  );
});

test("group comparison stays calibrated when one group is small (regression)", () => {
  // Welch's test alone is badly overconfident for e.g. 6 days vs 69 days of
  // 1-5 ratings: roughly 8x too many p < 0.001 results. The combined test must not be.
  let seed = 12345;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const group = (n: number) => {
    const xs = Array.from({ length: n }, () => 1 + Math.floor(rand() * 5));
    const m = xs.reduce((a, b) => a + b, 0) / n;
    return { n, m, v: xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) };
  };
  const TRIALS = 40_000;
  let hits = 0;
  for (let k = 0; k < TRIALS; k++) {
    const r = compareGroups(group(6), group(69));
    if (r && r.p < 0.001) hits++;
  }
  assert.ok(
    hits / TRIALS < 0.002,
    `P(p<0.001) = ${hits / TRIALS}, should be about 0.001 or lower`,
  );
});

test("planted effects are labelled with sensible confidence, and tiny samples never are 'solid'", () => {
  const insights = computeInsights(buildDays(demo));
  const lifting = insights.find((i) => i.id === "lifted:stress")!;
  assert.equal(lifting.confidence, "solid");
  assert.ok(lifting.q <= 0.01);

  const small = computeInsights(buildDays(generateDemoEntries(END, 14)));
  assert.ok(
    small.every(
      (i) => Math.min(i.nWith, i.nWithout) >= 10 || i.confidence !== "solid",
    ),
  );
});

test("t-test p-values match reference values", () => {
  const close = (a: number, b: number, tol = 2e-3) =>
    assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
  close(tTestP(2.228139, 10), 0.05);
  close(tTestP(2.0, 10), 0.0734);
  close(tTestP(1.96, 1e6), 0.05);
  close(tTestP(3.0, 30), 0.0054);
  close(tTestP(0, 12), 1);
  close(tTestP(-2.0, 10), tTestP(2.0, 10), 1e-12);
});

test("Benjamini-Hochberg adjusts p-values the standard way", () => {
  const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.005]);
  [0.02, 0.04, 0.04, 0.02].forEach((v, i) =>
    assert.ok(Math.abs(q[i] - v) < 1e-12, `q[${i}] = ${q[i]}`),
  );
  assert.deepEqual(benjaminiHochberg([]), []);
});

test("streak counts consecutive logged days, allowing today to be pending", () => {
  const mk = (date: string): Entry => ({
    date,
    period: "night",
    data: {},
    updatedAt: "",
  });
  const days = buildDays([
    mk("2026-03-08"),
    mk("2026-03-09"),
    mk("2026-03-10"),
    mk("2026-03-05"),
  ]);
  assert.equal(currentStreak(days, "2026-03-10"), 3);
  assert.equal(currentStreak(days, "2026-03-11"), 3);
  assert.equal(currentStreak(days, "2026-03-12"), 0);
});

test("rolling mean ignores gaps and leaves long breaks empty", () => {
  assert.deepEqual(rollingMean([2, 4, undefined, 6], 3), [2, 3, 3, 5]);
  assert.deepEqual(rollingMean([undefined, undefined, 5], 2), [
    undefined,
    undefined,
    5,
  ]);
  assert.deepEqual(rollingMean([1, undefined, undefined, undefined, 3], 2), [
    1,
    1,
    undefined,
    undefined,
    3,
  ]);
});

test("weekday pattern buckets by Monday-first weekday", () => {
  // 2026-03-02 is a Monday
  const days = buildDays([
    {
      date: "2026-03-02",
      period: "night",
      data: { me: { mood: 5, energy: 5, stress: 1 } },
      updatedAt: "",
    },
  ]);
  const p = weekdayPattern(days);
  assert.equal(p[0].avg, 100);
  assert.equal(p[1].avg, undefined);
});

test("progress counts answered questions; prune keeps meaningful empty lists", () => {
  const data = {
    me: { mood: 4 },
    meds: { taken: [] as string[] },
    injuries: [],
  };
  assert.equal(progress("night", data).answered, 3);
  assert.deepEqual(prune({ me: {}, notes: undefined, meds: { taken: [] } }), {
    meds: { taken: [] },
  });
});

test("injuries carry forward from the most recent earlier check-in", () => {
  const entries: Entry[] = [
    {
      date: "2026-03-01",
      period: "night",
      data: { injuries: [{ part: "Neck", severity: 2 }] },
      updatedAt: "",
    },
    {
      date: "2026-03-02",
      period: "morning",
      data: { injuries: [{ part: "Neck", severity: 1 }] },
      updatedAt: "",
    },
    { date: "2026-03-05", period: "morning", data: {}, updatedAt: "" },
  ];
  assert.deepEqual(carriedInjuries(entries, "2026-03-02", "night"), [
    { part: "Neck", severity: 1 },
  ]);
  assert.deepEqual(carriedInjuries(entries, "2026-03-02", "morning"), [
    { part: "Neck", severity: 2 },
  ]);
  assert.equal(carriedInjuries(entries, "2026-02-01", "morning"), undefined);
});

test("CSV exports are well-formed", () => {
  const daily = dailyCsv(demo).split("\r\n");
  const header = daily[0].split(",");
  assert.ok(
    header.includes("day_score") &&
      header.includes("harvey_behaviour") &&
      header.includes("lifted"),
  );
  assert.ok(daily.length > 60);
  assert.ok(
    daily.slice(1, -1).every((row) => row.split(",").length === header.length),
  );

  const raw = rawCsv([
    {
      date: "2026-01-01",
      period: "night",
      data: {
        notes: 'said "hi", left',
        kids: { leni: { behaviour: 4, tags: ["great", "clingy"] } },
      },
      updatedAt: "",
    },
  ]);
  assert.match(raw, /"said ""hi"", left"/);
  assert.match(raw, /great\|clingy/);
  assert.match(raw, /kids\.leni\.behaviour/);
});

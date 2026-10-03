import { KIDS, WIFE_NAME } from "./config";
import { addDays, weekdayIndex } from "./dates";
import { benjaminiHochberg, compareGroups } from "./stats";
import type { Entry, EntryData } from "./schema";

// ------------------------------------------------------------- day records
//
// Entries (up to two per day) are rolled up into one flat record per day. A
// field is `undefined` when it was never answered; it is only `false` / `0`
// when the answer really was "no" / "none". Missing is never treated as zero.

export interface DayRecord {
  date: string;
  hasMorning: boolean;
  hasNight: boolean;

  mood?: number;
  energy?: number;
  stress?: number;
  moodAm?: number;
  energyAm?: number;
  stressAm?: number;
  moodPm?: number;
  energyPm?: number;
  stressPm?: number;
  /** 0-100, from mood + energy + (inverted) stress, averaged over the day */
  wellbeing?: number;
  wellbeingAm?: number;
  wellbeingPm?: number;

  sleepHours?: number;
  sleepQuality?: number;

  wifeMood?: number;
  wifeMoodPm?: number;
  wifeUnwell?: boolean;

  kids: Record<string, number | undefined>;
  kidsAvg?: number;

  lifted?: boolean;
  cardio?: boolean;
  cardioMins?: number;
  exercised?: boolean;

  work?: "none" | "wfh" | "office";
  workHours?: number;

  panadol?: boolean;
  nurofen?: boolean;
  weightLoss?: boolean;
  otherMed?: boolean;
  painMed?: boolean;

  alcohol?: number;
  caffeine?: number;
  water?: number;
  junk?: number;
  steps?: number;
  outdoorMins?: number;

  wifeTime?: boolean;
  oneOnOne?: number;
  screenHours?: number;

  /** worst injury severity that day: 0 = none, undefined = not answered */
  injury?: number;
  injuryParts: string[];
}

type N = number | undefined;

const mean = (xs: N[]): N => {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

const wellbeingOf = (d: EntryData | undefined): N => {
  const me = d?.me;
  if (!me) return undefined;
  const parts: number[] = [];
  if (me.mood) parts.push(me.mood);
  if (me.energy) parts.push(me.energy);
  if (me.stress) parts.push(6 - me.stress);
  if (!parts.length) return undefined;
  return ((parts.reduce((a, b) => a + b, 0) / parts.length - 1) / 4) * 100;
};

export function buildDays(entries: Entry[]): DayRecord[] {
  const byDate = new Map<string, { am?: EntryData; pm?: EntryData }>();
  for (const e of entries) {
    const slot = byDate.get(e.date) ?? {};
    if (e.period === "morning") slot.am = e.data;
    else slot.pm = e.data;
    byDate.set(e.date, slot);
  }

  return [...byDate.keys()].sort().map((date) => {
    const { am, pm } = byDate.get(date)!;
    const wbAm = wellbeingOf(am);
    const wbPm = wellbeingOf(pm);

    const kids: Record<string, number | undefined> = {};
    for (const k of KIDS) kids[k.key] = pm?.kids?.[k.key]?.behaviour;

    const wifeTags = [...(am?.wife?.tags ?? []), ...(pm?.wife?.tags ?? [])];
    const wifeAnswered = am?.wife !== undefined || pm?.wife !== undefined;

    const taken = pm?.meds?.taken;
    const injuryLists = [am?.injuries, pm?.injuries].filter((x): x is NonNullable<typeof x> => x !== undefined);
    const injuryAll = injuryLists.flat();

    const lifted = pm?.training?.lifted;
    const cardio = pm?.training?.cardio;

    return {
      date,
      hasMorning: !!am,
      hasNight: !!pm,

      mood: mean([am?.me?.mood, pm?.me?.mood]),
      energy: mean([am?.me?.energy, pm?.me?.energy]),
      stress: mean([am?.me?.stress, pm?.me?.stress]),
      moodAm: am?.me?.mood,
      energyAm: am?.me?.energy,
      stressAm: am?.me?.stress,
      moodPm: pm?.me?.mood,
      energyPm: pm?.me?.energy,
      stressPm: pm?.me?.stress,
      wellbeing: mean([wbAm, wbPm]),
      wellbeingAm: wbAm,
      wellbeingPm: wbPm,

      sleepHours: am?.sleep?.hours,
      sleepQuality: am?.sleep?.quality,

      wifeMood: mean([am?.wife?.mood, pm?.wife?.mood]),
      wifeMoodPm: pm?.wife?.mood,
      wifeUnwell: wifeAnswered ? wifeTags.includes("sick") || wifeTags.includes("flat") : undefined,

      kids,
      kidsAvg: mean(Object.values(kids)),

      lifted,
      cardio,
      cardioMins: pm?.training?.cardioMins,
      exercised: lifted === undefined && cardio === undefined ? undefined : !!(lifted || cardio),

      work: pm?.work?.type,
      workHours: pm?.work?.hours,

      panadol: taken ? taken.includes("panadol") : undefined,
      nurofen: taken ? taken.includes("nurofen") : undefined,
      weightLoss: taken ? taken.includes("weightloss") : undefined,
      otherMed: taken ? taken.includes("other") : undefined,
      painMed: taken ? taken.includes("panadol") || taken.includes("nurofen") : undefined,

      alcohol: pm?.habits?.alcohol,
      caffeine: pm?.habits?.caffeine,
      water: pm?.habits?.water,
      junk: pm?.habits?.junk,
      steps: pm?.habits?.steps,
      outdoorMins: pm?.habits?.outdoorMins,

      wifeTime: pm?.mind?.wifeTime,
      oneOnOne: pm?.mind?.oneOnOne?.length,
      screenHours: pm?.mind?.screenHours,

      injury: injuryLists.length ? Math.max(0, ...injuryAll.map((i) => i.severity)) : undefined,
      injuryParts: [...new Set(injuryAll.map((i) => i.part))],
    };
  });
}

// ------------------------------------------------------------------ streak

/** Consecutive logged days ending today (or yesterday, if today isn't logged yet). */
export function currentStreak(days: DayRecord[], today: string): number {
  const logged = new Set(days.map((d) => d.date));
  let cursor = logged.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (logged.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// ---------------------------------------------------------------- insights

interface Outcome {
  id: string;
  /** noun phrase, e.g. "your end-of-day mood" */
  label: string;
  /** 1 when higher is better, -1 when lower is better */
  better: 1 | -1;
  /** 0 = same day, 1 = the following day */
  lag: 0 | 1;
  /** overrides the default "on days" / "after days" lead-in */
  when?: string;
  get: (d: DayRecord) => N;
  fmt: (diff: number) => string;
  minDiff: number;
}

interface Driver {
  id: string;
  /** reads after "on days" / "after days", e.g. "you lifted weights" */
  phrase: string;
  test: (d: DayRecord) => boolean | undefined;
  /** outcomes that would be circular for this driver */
  skip?: string[];
}

const pts = (x: number) => `${Math.round(Math.abs(x))} pts`;
const scale = (x: number) => Math.abs(x).toFixed(1);
const hours = (x: number) => `${Math.abs(x).toFixed(1)}h`;

export const OUTCOMES: Outcome[] = [
  { id: "mood", label: "your end-of-day mood", better: 1, lag: 0, get: (d) => d.moodPm, fmt: scale, minDiff: 0.3 },
  { id: "energy", label: "your end-of-day energy", better: 1, lag: 0, get: (d) => d.energyPm, fmt: scale, minDiff: 0.3 },
  { id: "stress", label: "your end-of-day stress", better: -1, lag: 0, get: (d) => d.stressPm, fmt: scale, minDiff: 0.3 },
  { id: "wellbeing", label: "your day score", better: 1, lag: 0, get: (d) => d.wellbeingPm, fmt: pts, minDiff: 8 },
  { id: "kids", label: "the kids' behaviour", better: 1, lag: 0, get: (d) => d.kidsAvg, fmt: scale, minDiff: 0.3 },
  { id: "wifeMood", label: `${WIFE_NAME}'s mood`, better: 1, lag: 0, get: (d) => d.wifeMoodPm, fmt: scale, minDiff: 0.3 },
  { id: "nextMood", label: "your next-morning mood", better: 1, lag: 1, get: (d) => d.moodAm, fmt: scale, minDiff: 0.3 },
  { id: "nextEnergy", label: "your next-morning energy", better: 1, lag: 1, get: (d) => d.energyAm, fmt: scale, minDiff: 0.3 },
  { id: "nextStress", label: "your next-morning stress", better: -1, lag: 1, get: (d) => d.stressAm, fmt: scale, minDiff: 0.3 },
  { id: "nextSleepQ", label: "your sleep quality that night", better: 1, lag: 1, when: "on days", get: (d) => d.sleepQuality, fmt: scale, minDiff: 0.3 },
  { id: "nextSleepH", label: "your sleep that night", better: 1, lag: 1, when: "on days", get: (d) => d.sleepHours, fmt: hours, minDiff: 0.4 },
];

const known = (x: N, fn: (v: number) => boolean): boolean | undefined => (x === undefined ? undefined : fn(x));

export const DRIVERS: Driver[] = [
  { id: "lifted", phrase: "you lifted weights", test: (d) => d.lifted },
  { id: "cardio", phrase: "you did cardio", test: (d) => d.cardio },
  { id: "exercised", phrase: "you exercised (lifting or cardio)", test: (d) => d.exercised },
  { id: "wfh", phrase: "you worked from home", test: (d) => (d.work === undefined ? undefined : d.work === "wfh") },
  { id: "office", phrase: "you worked at the office", test: (d) => (d.work === undefined ? undefined : d.work === "office") },
  { id: "dayOff", phrase: "you weren't working", test: (d) => (d.work === undefined ? undefined : d.work === "none") },
  { id: "longWork", phrase: "you worked 9+ hours", test: (d) => known(d.workHours, (h) => h >= 9) },
  { id: "alcohol", phrase: "you had alcohol", test: (d) => known(d.alcohol, (n) => n >= 1) },
  { id: "caffeine", phrase: "you had 3+ caffeinated drinks", test: (d) => known(d.caffeine, (n) => n >= 3) },
  { id: "water", phrase: "you drank 8+ glasses of water", test: (d) => known(d.water, (n) => n >= 8) },
  { id: "junk", phrase: "you ate a lot of junk food", test: (d) => known(d.junk, (n) => n >= 2) },
  { id: "steps", phrase: "you hit 8,000+ steps", test: (d) => known(d.steps, (n) => n >= 8000) },
  { id: "outdoors", phrase: "you spent 30+ minutes outside", test: (d) => known(d.outdoorMins, (n) => n >= 30) },
  { id: "screens", phrase: "you had 3+ hours of screen time", test: (d) => known(d.screenHours, (n) => n >= 3) },
  { id: "wifeTime", phrase: `you had quality time with ${WIFE_NAME.toLowerCase()}`, test: (d) => d.wifeTime },
  { id: "oneOnOne", phrase: "you spent one-on-one time with a kid", test: (d) => known(d.oneOnOne, (n) => n >= 1) },
  { id: "painMed", phrase: "you took Panadol or Nurofen", test: (d) => d.painMed },
  { id: "weightLoss", phrase: "you took your weight-loss medication", test: (d) => d.weightLoss },
  { id: "injury", phrase: "you had an injury", test: (d) => known(d.injury, (n) => n > 0) },
  { id: "sleep7", phrase: "you slept 7+ hours", test: (d) => known(d.sleepHours, (h) => h >= 7), skip: ["nextSleepH", "nextSleepQ"] },
  { id: "sleep6", phrase: "you slept under 6 hours", test: (d) => known(d.sleepHours, (h) => h < 6), skip: ["nextSleepH", "nextSleepQ"] },
  { id: "goodSleep", phrase: "you rated your sleep 4 or 5", test: (d) => known(d.sleepQuality, (q) => q >= 4), skip: ["nextSleepH", "nextSleepQ"] },
  {
    id: "wifeUnwell",
    phrase: `${WIFE_NAME.toLowerCase()} was sick or flat`,
    test: (d) => d.wifeUnwell,
    skip: ["wifeMood"],
  },
  {
    id: "highStress",
    phrase: "your stress was high (4-5)",
    test: (d) => known(d.stressPm, (s) => s >= 4),
    skip: ["mood", "energy", "stress", "wellbeing"],
  },
  {
    id: "roughKids",
    phrase: "the kids had a rough day",
    test: (d) => known(d.kidsAvg, (k) => k < 3),
    skip: ["kids"],
  },
];

export type Confidence = "early" | "forming" | "solid";

export interface Insight {
  id: string;
  driverId: string;
  outcomeId: string;
  headline: string;
  withMean: number;
  withoutMean: number;
  nWith: number;
  nWithout: number;
  diff: number;
  t: number;
  /** two-sided p-value for this one comparison */
  p: number;
  /** false-discovery-adjusted p-value across every comparison the engine ran */
  q: number;
  good: boolean;
  confidence: Confidence;
  lag: 0 | 1;
}

const MIN_GROUP = 5;
/** Findings above this false-discovery rate are not shown at all. */
const MAX_Q = 0.15;
export const MIN_DAYS_FOR_INSIGHTS = 10;

function stats(xs: number[]) {
  const n = xs.length;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const v = n > 1 ? xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) : 0;
  return { n, m, v };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Compares how each outcome differs on days with vs without each behaviour.
 *
 * Roughly 280 comparisons run at once, so some would look convincing by pure
 * chance. Every comparison gets a cautious t-test p-value, then Benjamini-Hochberg
 * adjusts them together (q). Only findings with q <= 15% are shown, and the
 * confidence label comes from q and sample size, never from the effect size alone.
 */
interface Comparison {
  driver: Driver;
  outcome: Outcome;
  a: ReturnType<typeof stats>;
  b: ReturnType<typeof stats>;
  diff: number;
  t: number;
  p: number;
  q: number;
}

/** Every driver/outcome comparison with enough data, each with its p and FDR-adjusted q. */
export function runComparisons(days: DayRecord[]): Comparison[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const candidates: Omit<Comparison, "q">[] = [];

  for (const driver of DRIVERS) {
    for (const outcome of OUTCOMES) {
      if (driver.skip?.includes(outcome.id)) continue;

      const withG: number[] = [];
      const withoutG: number[] = [];
      for (const day of days) {
        const flag = driver.test(day);
        if (flag === undefined) continue;
        const target = outcome.lag === 0 ? day : byDate.get(addDays(day.date, 1));
        const value = target ? outcome.get(target) : undefined;
        if (value === undefined) continue;
        (flag ? withG : withoutG).push(value);
      }
      if (withG.length < MIN_GROUP || withoutG.length < MIN_GROUP) continue;

      const a = stats(withG);
      const b = stats(withoutG);
      const result = compareGroups(a, b);
      if (!result) continue;
      candidates.push({ driver, outcome, a, b, diff: result.diff, t: result.t, p: result.p });
    }
  }

  // every comparison counts towards the correction, even ones later hidden for being tiny
  const q = benjaminiHochberg(candidates.map((c) => c.p));
  return candidates.map((c, k) => ({ ...c, q: q[k] }));
}

export function computeInsights(days: DayRecord[]): Insight[] {
  if (days.length < MIN_DAYS_FOR_INSIGHTS) return [];
  const out: Insight[] = [];

  for (const c of runComparisons(days)) {
    if (Math.abs(c.diff) < c.outcome.minDiff || c.q > MAX_Q) continue;
    const nMin = Math.min(c.a.n, c.b.n);
    const confidence: Confidence = c.q <= 0.01 && nMin >= 10 ? "solid" : c.q <= 0.05 && nMin >= 6 ? "forming" : "early";
    const when = c.outcome.when ?? (c.outcome.lag === 0 ? "on days" : "after days");
    out.push({
      id: `${c.driver.id}:${c.outcome.id}`,
      driverId: c.driver.id,
      outcomeId: c.outcome.id,
      headline: `${capitalise(c.outcome.label)} is ${c.outcome.fmt(c.diff)} ${c.diff > 0 ? "higher" : "lower"} ${when} ${c.driver.phrase}`,
      withMean: c.a.m,
      withoutMean: c.b.m,
      nWith: c.a.n,
      nWithout: c.b.n,
      diff: c.diff,
      t: c.t,
      p: c.p,
      q: c.q,
      good: c.diff * c.outcome.better > 0,
      confidence,
      lag: c.outcome.lag,
    });
  }

  return out.sort((x, y) => x.q - y.q || Math.abs(y.t) - Math.abs(x.t));
}

/** Top insights split into "helps" and "hurts", at most `perDriver` per driver. */
export function pickInsights(all: Insight[], limit = 6, perDriver = 1) {
  const take = (good: boolean) => {
    const used = new Map<string, number>();
    const picked: Insight[] = [];
    for (const i of all) {
      if (i.good !== good) continue;
      if ((used.get(i.driverId) ?? 0) >= perDriver) continue;
      used.set(i.driverId, (used.get(i.driverId) ?? 0) + 1);
      picked.push(i);
      if (picked.length >= limit) break;
    }
    return picked;
  };
  return { helps: take(true), hurts: take(false) };
}

export function outcomeFormat(outcomeId: string, value: number): string {
  switch (outcomeId) {
    case "wellbeing":
      return `${Math.round(value)}`;
    case "nextSleepH":
      return `${value.toFixed(1)}h`;
    default:
      return value.toFixed(1);
  }
}

// ------------------------------------------------------ patterns & summaries

/** Average day score by weekday (0 = Mon). Returns undefined entries when no data. */
export function weekdayPattern(days: DayRecord[]): { avg: N; n: number }[] {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const d of days) if (d.wellbeing !== undefined) buckets[weekdayIndex(d.date)].push(d.wellbeing);
  return buckets.map((b) => ({ avg: mean(b), n: b.length }));
}

export interface Rate {
  yes: number;
  of: number;
}

export function rate(days: DayRecord[], pick: (d: DayRecord) => boolean | undefined): Rate {
  let yes = 0;
  let of = 0;
  for (const d of days) {
    const v = pick(d);
    if (v === undefined) continue;
    of++;
    if (v) yes++;
  }
  return { yes, of };
}

/**
 * Trailing rolling average over `window` positions, ignoring gaps. A position with
 * no data in its window stays undefined, so a long break in logging shows as a break.
 */
export function rollingMean(values: N[], window = 7): N[] {
  return values.map((_, i) => mean(values.slice(Math.max(0, i - window + 1), i + 1)));
}

export function average(days: DayRecord[], pick: (d: DayRecord) => N): N {
  return mean(days.map(pick));
}

export interface InjurySummary {
  part: string;
  days: number;
  worst: number;
  lastSeen: string;
}

export function injurySummary(entries: Entry[]): InjurySummary[] {
  const map = new Map<string, { dates: Set<string>; worst: number; last: string }>();
  for (const e of entries) {
    for (const i of e.data.injuries ?? []) {
      const cur = map.get(i.part) ?? { dates: new Set<string>(), worst: 0, last: "" };
      cur.dates.add(e.date);
      cur.worst = Math.max(cur.worst, i.severity);
      if (e.date > cur.last) cur.last = e.date;
      map.set(i.part, cur);
    }
  }
  return [...map.entries()]
    .map(([part, v]) => ({ part, days: v.dates.size, worst: v.worst, lastSeen: v.last }))
    .sort((a, b) => b.days - a.days);
}

// ------------------------------------------------------------------ export

export const DAILY_COLUMNS: { key: string; get: (d: DayRecord) => string | number | boolean | undefined }[] = [
  { key: "date", get: (d) => d.date },
  { key: "weekday", get: (d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekdayIndex(d.date)] },
  { key: "morning_logged", get: (d) => d.hasMorning },
  { key: "night_logged", get: (d) => d.hasNight },
  { key: "day_score", get: (d) => (d.wellbeing === undefined ? undefined : Math.round(d.wellbeing)) },
  { key: "mood_am", get: (d) => d.moodAm },
  { key: "energy_am", get: (d) => d.energyAm },
  { key: "stress_am", get: (d) => d.stressAm },
  { key: "mood_pm", get: (d) => d.moodPm },
  { key: "energy_pm", get: (d) => d.energyPm },
  { key: "stress_pm", get: (d) => d.stressPm },
  { key: "sleep_hours", get: (d) => d.sleepHours },
  { key: "sleep_quality", get: (d) => d.sleepQuality },
  { key: "wife_mood", get: (d) => d.wifeMood },
  { key: "wife_unwell", get: (d) => d.wifeUnwell },
  ...KIDS.map((k) => ({ key: `${k.key}_behaviour`, get: (d: DayRecord) => d.kids[k.key] })),
  { key: "kids_avg", get: (d) => d.kidsAvg },
  { key: "lifted", get: (d) => d.lifted },
  { key: "cardio", get: (d) => d.cardio },
  { key: "cardio_mins", get: (d) => d.cardioMins },
  { key: "work", get: (d) => d.work },
  { key: "work_hours", get: (d) => d.workHours },
  { key: "panadol", get: (d) => d.panadol },
  { key: "nurofen", get: (d) => d.nurofen },
  { key: "weight_loss_med", get: (d) => d.weightLoss },
  { key: "other_med", get: (d) => d.otherMed },
  { key: "alcohol_drinks", get: (d) => d.alcohol },
  { key: "caffeine_drinks", get: (d) => d.caffeine },
  { key: "water_glasses", get: (d) => d.water },
  { key: "junk_food_0to2", get: (d) => d.junk },
  { key: "steps", get: (d) => d.steps },
  { key: "outdoor_mins", get: (d) => d.outdoorMins },
  { key: "wife_quality_time", get: (d) => d.wifeTime },
  { key: "one_on_one_kids", get: (d) => d.oneOnOne },
  { key: "screen_hours", get: (d) => d.screenHours },
  { key: "worst_injury_0to5", get: (d) => d.injury },
  { key: "injury_parts", get: (d) => d.injuryParts.join("|") || undefined },
];

import { KIDS, MEDS, WORK_TYPES } from "./config";
import type { Entry, EntryData, Period } from "./schema";

/** Drops empty objects and undefined values; keeps meaningful empty arrays ("none today"). */
export function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const p = prune(v);
      if (p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length === 0) continue;
      out[k] = p;
    }
    return out as T;
  }
  return value;
}

export interface Question {
  id: string;
  done: (d: EntryData) => boolean;
}

const has = (v: unknown) => v !== undefined && v !== null;

const meQuestions: Question[] = [
  { id: "mood", done: (d) => has(d.me?.mood) },
  { id: "energy", done: (d) => has(d.me?.energy) },
  { id: "stress", done: (d) => has(d.me?.stress) },
];

export const QUESTIONS: Record<Period, Question[]> = {
  morning: [
    ...meQuestions,
    { id: "sleepHours", done: (d) => has(d.sleep?.hours) },
    { id: "sleepQuality", done: (d) => has(d.sleep?.quality) },
    { id: "wifeMood", done: (d) => has(d.wife?.mood) },
    { id: "injuries", done: (d) => has(d.injuries) },
  ],
  night: [
    ...meQuestions,
    { id: "work", done: (d) => has(d.work?.type) },
    { id: "lifted", done: (d) => has(d.training?.lifted) },
    { id: "cardio", done: (d) => has(d.training?.cardio) },
    { id: "wifeMood", done: (d) => has(d.wife?.mood) },
    { id: "wifeTime", done: (d) => has(d.mind?.wifeTime) },
    ...KIDS.map((k) => ({ id: `kid-${k.key}`, done: (d: EntryData) => has(d.kids?.[k.key]?.behaviour) })),
    { id: "oneOnOne", done: (d) => has(d.mind?.oneOnOne) },
    { id: "injuries", done: (d) => has(d.injuries) },
    { id: "meds", done: (d) => has(d.meds?.taken) },
    { id: "alcohol", done: (d) => has(d.habits?.alcohol) },
    { id: "caffeine", done: (d) => has(d.habits?.caffeine) },
    { id: "water", done: (d) => has(d.habits?.water) },
    { id: "junk", done: (d) => has(d.habits?.junk) },
    { id: "steps", done: (d) => has(d.habits?.steps) },
    { id: "outdoor", done: (d) => has(d.habits?.outdoorMins) },
    { id: "screen", done: (d) => has(d.mind?.screenHours) },
  ],
};

export function progress(period: Period, data: EntryData) {
  const qs = QUESTIONS[period];
  return { answered: qs.filter((q) => q.done(data)).length, total: qs.length };
}

/**
 * Injuries linger, so a new check-in starts from the most recent known state
 * (the user just updates severities or clears them) instead of from scratch.
 */
export function carriedInjuries(entries: Entry[], date: string, period: Period): EntryData["injuries"] {
  let best: Entry | undefined;
  for (const e of entries) {
    if (e.data.injuries === undefined) continue;
    const before = e.date < date || (e.date === date && e.period === "morning" && period === "night");
    if (!before) continue;
    if (!best || e.date > best.date || (e.date === best.date && e.period === "night")) best = e;
  }
  return best ? best.data.injuries!.map((i) => ({ ...i })) : undefined;
}

const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)}h`;

/** Short chips shown on the home cards and in the history list. */
export function summaryChips(data: EntryData, period: Period): string[] {
  const chips: string[] = [];
  const me = data.me;
  if (me?.mood) chips.push(`Mood ${me.mood}`);
  if (me?.energy) chips.push(`Energy ${me.energy}`);
  if (me?.stress) chips.push(`Stress ${me.stress}`);
  if (period === "morning") {
    if (data.sleep?.hours !== undefined) chips.push(`${fmtHours(data.sleep.hours)} sleep`);
  } else {
    if (data.work?.type) chips.push(WORK_TYPES.find((w) => w.key === data.work!.type)!.label);
    if (data.training?.lifted) chips.push("Lifted");
    if (data.training?.cardio) chips.push(data.training.cardioMins ? `Cardio ${data.training.cardioMins}m` : "Cardio");
    const meds = data.meds?.taken?.map((k) => MEDS.find((m) => m.key === k)?.label ?? k);
    if (meds?.length) chips.push(meds.join(" + "));
  }
  if (data.injuries?.length) chips.push(`${data.injuries.length} injur${data.injuries.length === 1 ? "y" : "ies"}`);
  return chips;
}

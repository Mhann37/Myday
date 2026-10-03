import { addDays, weekdayIndex } from "../lib/dates";
import type { Entry, EntryData } from "../lib/schema";

// Synthetic diary data for trying the app and for testing the insights engine.
// Effects are planted on purpose so tests can check the engine finds them:
//   - lifting weights  -> better end-of-day mood, lower stress
//   - alcohol          -> worse sleep quality and energy the next morning
//   - sleeping 7h+     -> more energy that day
//   - high stress days -> rougher kids' behaviour

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const scale = (n: number) => clamp(Math.round(n), 1, 5);

export function generateDemoEntries(endDate: string, days = 75, seed = 7): Entry[] {
  const rng = mulberry32(seed);
  const noise = (amp: number) => (rng() - 0.5) * 2 * amp;
  const out: Entry[] = [];
  let prevAlcohol = false;

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const weekday = weekdayIndex(date) <= 4;

    const lifted = rng() < 0.4;
    const cardio = !lifted && rng() < 0.35;
    const alcohol = rng() < 0.3 ? 1 + Math.floor(rng() * 4) : 0;
    const work: "none" | "wfh" | "office" = weekday ? (rng() < 0.5 ? "wfh" : "office") : "none";

    const sleepHours = clamp(Math.round((7 + noise(1.3) - (prevAlcohol ? 0.9 : 0)) * 2) / 2, 4, 10);
    const sleepQuality = scale(3.3 + (sleepHours - 7) * 0.5 + noise(0.8) - (prevAlcohol ? 1 : 0));

    const injuryAgo = i >= 18 && i <= 30;
    const injuries = injuryAgo ? [{ part: "Lower back", severity: scale(3 - (30 - i) / 6) }] : [];

    const morning: EntryData = {
      me: {
        mood: scale(3.5 + (sleepHours - 7) * 0.3 + noise(0.9)),
        energy: scale(3.2 + (sleepHours - 7) * 0.5 - (prevAlcohol ? 0.9 : 0) + noise(0.8)),
        stress: scale(2.6 + noise(1)),
      },
      sleep: { hours: sleepHours, quality: sleepQuality },
      wife: { mood: scale(3.6 + noise(1)), tags: rng() < 0.12 ? ["flat"] : [] },
      injuries,
    };

    const nightStress = scale(2.7 + (work === "office" ? 0.4 : 0) - (lifted ? 0.7 : 0) + noise(1));
    const kidBase = 3.7 - (nightStress >= 4 ? 0.9 : 0);
    const meds: string[] = [];
    if (injuryAgo && rng() < 0.6) meds.push("panadol");
    if (weekdayIndex(date) === 6) meds.push("weightloss");

    const night: EntryData = {
      me: {
        mood: scale(3.3 + (lifted ? 0.7 : 0) - (alcohol ? 0.2 : 0) + noise(0.8)),
        energy: scale(3 + (sleepHours >= 7 ? 0.6 : -0.3) + (lifted ? 0.2 : 0) + noise(0.8)),
        stress: nightStress,
      },
      work: { type: work, hours: work === "none" ? undefined : 8 + Math.floor(rng() * 3) },
      training: {
        lifted,
        cardio,
        cardioMins: cardio ? 20 + Math.floor(rng() * 5) * 5 : undefined,
      },
      wife: { mood: scale(3.6 + noise(1)), tags: [] },
      kids: {
        harvey: { behaviour: scale(kidBase + noise(1)) },
        leni: { behaviour: scale(kidBase + 0.2 + noise(1)) },
        marshall: { behaviour: scale(kidBase - 0.2 + noise(1)) },
      },
      injuries,
      meds: { taken: meds },
      habits: {
        alcohol,
        caffeine: Math.floor(rng() * 4),
        water: 3 + Math.floor(rng() * 8),
        junk: Math.floor(rng() * 3),
        steps: Math.round((5500 + rng() * 6000 + (cardio ? 2000 : 0)) / 100) * 100,
        outdoorMins: Math.floor(rng() * 5) * 15,
      },
      mind: {
        wifeTime: rng() < 0.5,
        oneOnOne: rng() < 0.4 ? ["leni"] : [],
        screenHours: Math.round((1 + rng() * 3) * 2) / 2,
        win: rng() < 0.3 ? "Good session" : undefined,
      },
    };

    const stamp = new Date(`${date}T12:00:00Z`).toISOString();
    // a few missed check-ins, like real life
    if (rng() > 0.07) out.push({ date, period: "morning", data: morning, updatedAt: stamp });
    if (rng() > 0.09) out.push({ date, period: "night", data: night, updatedAt: stamp });

    prevAlcohol = alcohol > 0;
  }
  return out;
}

/**
 * Pure noise: every indicator is random and independent of every other, so any
 * "pattern" the engine reports from this data is a false discovery.
 */
export function generateNoiseEntries(endDate: string, days = 75, seed = 1): Entry[] {
  const rng = mulberry32(seed);
  const pick = (n: number) => 1 + Math.floor(rng() * n);
  const flip = (p = 0.5) => rng() < p;
  const out: Entry[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const stamp = new Date(`${date}T12:00:00Z`).toISOString();
    const me = () => ({ mood: pick(5), energy: pick(5), stress: pick(5) });

    out.push({
      date,
      period: "morning",
      updatedAt: stamp,
      data: {
        me: me(),
        sleep: { hours: 5 + Math.floor(rng() * 9) / 2, quality: pick(5) },
        wife: { mood: pick(5), tags: flip(0.2) ? ["sick"] : [] },
        injuries: flip(0.25) ? [{ part: "Neck", severity: pick(5) }] : [],
      },
    });
    out.push({
      date,
      period: "night",
      updatedAt: stamp,
      data: {
        me: me(),
        work: { type: (["none", "wfh", "office"] as const)[Math.floor(rng() * 3)], hours: 6 + Math.floor(rng() * 5) },
        training: { lifted: flip(), cardio: flip(0.3) },
        wife: { mood: pick(5), tags: flip(0.2) ? ["flat"] : [] },
        kids: { harvey: { behaviour: pick(5) }, leni: { behaviour: pick(5) }, marshall: { behaviour: pick(5) } },
        meds: { taken: flip(0.3) ? ["panadol"] : [] },
        habits: { alcohol: flip(0.3) ? pick(4) : 0, caffeine: Math.floor(rng() * 6), water: Math.floor(rng() * 12), junk: Math.floor(rng() * 3), steps: 3000 + Math.floor(rng() * 9000), outdoorMins: Math.floor(rng() * 5) * 15 },
        mind: { wifeTime: flip(), oneOnOne: flip(0.4) ? ["leni"] : [], screenHours: Math.floor(rng() * 6) },
      },
    });
  }
  return out;
}

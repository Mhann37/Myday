import { z } from "zod";
import { KIDS } from "./config";

export const OUTCOMES = {
  energy: { label: "Energy", unit: "/5", higher: true },
  mood: { label: "Mood", unit: "/5", higher: true },
  stress: { label: "Stress", unit: "/5", higher: false },
  sleepHours: { label: "Sleep", unit: "hours", higher: true },
} as const;
export type Outcome = keyof typeof OUTCOMES;
export const QUICK_FIELDS = {
  mood: "Mood",
  energy: "Energy",
  stress: "Stress",
  sleepHours: "Hours slept",
  sleepQuality: "Sleep quality",
  lifted: "Strength training",
  cardio: "Cardio",
  water: "Water",
  alcohol: "Alcohol",
  outdoor: "Time outside",
} as const;
export const preferencesSchema = z
  .object({
    morning: z
      .array(z.enum(["mood", "energy", "stress", "sleepHours", "sleepQuality"]))
      .min(1)
      .max(5),
    night: z
      .array(
        z.enum([
          "mood",
          "energy",
          "stress",
          "lifted",
          "cardio",
          "water",
          "alcohol",
          "outdoor",
        ]),
      )
      .min(1)
      .max(8),
    outcomes: z
      .array(z.enum(["energy", "mood", "stress", "sleepHours"]))
      .min(1)
      .max(4),
    hideCompleted: z.boolean(),
    partnerName: z.string().trim().min(1).max(32),
    childNames: z.record(z.string().max(32), z.string().trim().min(1).max(32)),
    dismissed: z.array(z.string().max(100)).max(100),
  })
  .refine(
    (p) =>
      [p.morning, p.night, p.outcomes].every(
        (a) => new Set(a).size === a.length,
      ),
    "Choose each field once",
  );
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = {
  morning: ["mood", "energy", "stress", "sleepHours", "sleepQuality"],
  night: [
    "mood",
    "energy",
    "stress",
    "lifted",
    "cardio",
    "water",
    "alcohol",
    "outdoor",
  ],
  outcomes: ["energy", "sleepHours"],
  hideCompleted: false,
  partnerName: "Partner",
  childNames: Object.fromEntries(KIDS.map((k) => [k.key, k.name])),
  dismissed: [],
};

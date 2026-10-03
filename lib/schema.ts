import { z } from "zod";

const scale = z.number().int().min(1).max(5);
const text = (max: number) => z.string().max(max);
const tags = z.array(text(32)).max(12);

const kid = z.object({
  behaviour: scale.optional(),
  tags: tags.optional(),
});

// Every field is optional on purpose: an unanswered question is stored as
// "missing", never as a made-up default, so the analysis stays honest.
export const entryDataSchema = z.object({
  me: z
    .object({
      mood: scale.optional(),
      energy: scale.optional(),
      stress: scale.optional(),
    })
    .optional(),
  sleep: z
    .object({
      hours: z.number().min(0).max(24).optional(),
      quality: scale.optional(),
    })
    .optional(),
  wife: z
    .object({
      mood: scale.optional(),
      tags: tags.optional(),
    })
    .optional(),
  kids: z.record(text(32), kid).optional(),
  injuries: z
    .array(z.object({ part: text(48), severity: scale }))
    .max(24)
    .optional(),
  training: z
    .object({
      lifted: z.boolean().optional(),
      liftFocus: tags.optional(),
      cardio: z.boolean().optional(),
      cardioTypes: tags.optional(),
      cardioMins: z.number().min(0).max(600).optional(),
    })
    .optional(),
  work: z
    .object({
      type: z.enum(["none", "wfh", "office"]).optional(),
      hours: z.number().min(0).max(24).optional(),
    })
    .optional(),
  meds: z
    .object({
      taken: tags.optional(),
      other: text(160).optional(),
      weightLossNote: text(160).optional(),
    })
    .optional(),
  habits: z
    .object({
      alcohol: z.number().min(0).max(60).optional(),
      caffeine: z.number().min(0).max(30).optional(),
      water: z.number().min(0).max(40).optional(),
      junk: z.number().int().min(0).max(2).optional(),
      steps: z.number().int().min(0).max(100000).optional(),
      outdoorMins: z.number().min(0).max(1440).optional(),
    })
    .optional(),
  mind: z
    .object({
      win: text(400).optional(),
      gratitude: text(400).optional(),
      wifeTime: z.boolean().optional(),
      oneOnOne: tags.optional(),
      screenHours: z.number().min(0).max(24).optional(),
    })
    .optional(),
  notes: text(2000).optional(),
});

export const periodSchema = z.enum(["morning", "night"]);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const putEntrySchema = z.object({
  date: dateSchema,
  period: periodSchema,
  data: entryDataSchema,
});

export type EntryData = z.infer<typeof entryDataSchema>;
export type Period = z.infer<typeof periodSchema>;

export interface Entry {
  date: string;
  period: Period;
  data: EntryData;
  updatedAt: string;
}

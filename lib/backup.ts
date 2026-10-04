import { z } from "zod";
import { preferencesSchema } from "./preferences";
import { experimentSchema } from "./experiments";
import { habitSchema, maxHabitValue } from "./habits";
import { dateSchema, entryDataSchema, periodSchema } from "./schema";

export const backupSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    entries: z
      .array(
        z.object({
          date: dateSchema,
          period: periodSchema,
          data: entryDataSchema,
        }),
      )
      .max(20000),
    records: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("preferences"),
            key: z.literal("preferences"),
            data: preferencesSchema,
          }),
          z
            .object({
              kind: z.literal("experiment"),
              key: z.string().regex(/^experiment:[0-9a-f-]{36}$/),
              data: experimentSchema,
            })
            .refine((r) => r.key === `experiment:${r.data.id}`),
        ]),
      )
      .max(1000)
      .optional(),
    habits: z.array(habitSchema).max(200).default([]),
    logs: z
      .array(
        z.object({
          habitId: z.string().uuid(),
          date: dateSchema,
          value: z.number().min(0).max(100000),
          updatedAt: z.string().datetime(),
          status: z.enum(["logged", "excused"]).optional(),
          source: z.string().max(100).optional(),
        }),
      )
      .max(50000)
      .default([]),
  })
  .refine((b) => {
    const habits = new Map(b.habits.map((h) => [h.id, h]));
    return b.logs.every((l) => {
      const h = habits.get(l.habitId);
      return (
        h &&
        l.date >= h.createdDate &&
        l.value <= maxHabitValue(h) &&
        (h.kind !== "check" || l.value === 0 || l.value === 1)
      );
    });
  }, "Every habit log must belong to a habit in this backup");
export type Backup = z.infer<typeof backupSchema>;
export interface RestoreResult {
  entriesAdded: number;
  habitsAdded: number;
  logsAdded: number;
}

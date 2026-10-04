import { z } from "zod";
import {
  dateSchema,
  entryDataSchema,
  periodSchema,
  type Entry,
} from "./schema";
import { habitSchema, habitLogSchema, type HabitData } from "./habits";
import { preferencesSchema } from "./preferences";
import { experimentSchema } from "./experiments";

const base = { id: z.string().uuid(), expected: z.string().nullable() };
export const mutationSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("entry"),
    key: z.string(),
    data: z
      .object({ date: dateSchema, period: periodSchema, data: entryDataSchema })
      .nullable(),
  }),
  z.object({
    ...base,
    kind: z.literal("habit"),
    key: z.string(),
    data: habitSchema,
    effectiveFrom: dateSchema,
  }),
  z.object({
    ...base,
    kind: z.literal("log"),
    key: z.string(),
    data: habitLogSchema,
  }),
  z.object({
    ...base,
    kind: z.literal("preferences"),
    key: z.literal("preferences"),
    data: preferencesSchema,
  }),
  z.object({
    ...base,
    kind: z.literal("experiment"),
    key: z.string(),
    data: experimentSchema,
  }),
]);
export type Mutation = z.infer<typeof mutationSchema>;
export interface VersionedRecord {
  key: string;
  data: unknown;
  revision: string;
}
export interface Workspace {
  entries: Entry[];
  habitData: HabitData;
  records: VersionedRecord[];
}
export class ConflictError extends Error {
  constructor() {
    super(
      "This record changed on another device. Review both versions before saving.",
    );
  }
}

import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { dateSchema } from "@/lib/schema";
import { getStore } from "@/lib/store";
import { maxHabitValue, habitValue } from "@/lib/habits";
import { buildDays } from "@/lib/analytics";
import { ConflictError } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token || token.length > 100)
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    const store = getStore(),
      records = await store.listRecords(),
      digest = createHash("sha256").update(token).digest("hex");
    const record = records.find((r) => {
      if (!r.key.startsWith("config:integration:")) return false;
      const d = r.data as { enabled: boolean; digest: string };
      return (
        d.enabled &&
        d.digest?.length === digest.length &&
        timingSafeEqual(Buffer.from(d.digest), Buffer.from(digest))
      );
    });
    if (!record)
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    const config = record.data as { id: string; habitIds: string[] },
      text = await request.text();
    if (text.length > 100000)
      return Response.json({ error: "Too large" }, { status: 413 });
    const parsed = z
      .object({
        readings: z
          .array(
            z.object({
              habitId: z.string().uuid(),
              date: dateSchema,
              value: z.number().min(0).max(100000),
            }),
          )
          .min(1)
          .max(500),
      })
      .safeParse(JSON.parse(text));
    if (!parsed.success)
      return Response.json(
        { error: "Use readings with habitId, date and value." },
        { status: 400 },
      );
    const [data, entries] = await Promise.all([
        store.listHabits(),
        store.list(),
      ]),
      days = buildDays(entries);
    let imported = 0,
      skipped = 0;
    for (const r of parsed.data.readings) {
      const h = data.habits.find((h) => h.id === r.habitId),
        existing = data.logs.find(
          (l) => l.habitId === r.habitId && l.date === r.date,
        ),
        source = `integration:${config.id}`;
      if (
        !h ||
        h.archived ||
        !config.habitIds.includes(h.id) ||
        r.date < h.createdDate ||
        r.date > new Date(Date.now() + 86400000).toISOString().slice(0, 10) ||
        r.value > maxHabitValue(h) ||
        (h.kind === "check" && r.value !== 0 && r.value !== 1) ||
        (existing
          ? existing.source !== source
          : habitValue(h, r.date, data.logs, days) !== undefined)
      ) {
        skipped++;
        continue;
      }
      const key = `log:${r.habitId}:${r.date}`,
        current = (await store.listRecords()).find((x) => x.key === key),
        mutation = {
          kind: "log" as const,
          key,
          id: randomUUID(),
          expected: current?.revision ?? null,
          data: { ...r, status: "logged" as const, source },
        };
      try {
        await store.writeRecord(
          key,
          mutation.data,
          mutation.expected,
          mutation.id,
          mutation,
        );
        const l = {
          ...r,
          status: "logged" as const,
          source,
          updatedAt: new Date().toISOString(),
        };
        data.logs = [
          ...data.logs.filter(
            (x) => !(x.habitId === r.habitId && x.date === r.date),
          ),
          l,
        ];
        records.splice(0,records.length,...records.filter(x=>x.key!==key),{key,data:mutation.data,revision:mutation.id});
        imported++;
      } catch (e) {
        if (e instanceof ConflictError) {
          skipped++;
          continue;
        }
        throw e;
      }
    }
    const latest = (await store.listRecords()).find(
      (r) => r.key === record.key,
    );
    if (latest)
      await store
        .writeRecord(
          record.key,
          {
            ...(latest.data as object),
            lastImportedAt: new Date().toISOString(),
          },
          latest.revision,
          randomUUID(),
        )
        .catch(() => {});
    return Response.json(
      { imported, skipped },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Could not import. Retry with the same readings; manual records are preserved.",
      },
      { status: 500 },
    );
  }
}

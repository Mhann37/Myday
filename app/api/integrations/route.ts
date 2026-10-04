import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { authorised, apiError } from "@/lib/api";
import { getStore } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    return Response.json(
      {
        sources: (await getStore().listRecords())
          .filter((r) => r.key.startsWith("config:integration:"))
          .map((r) => {
            const d = r.data as {
              id: string;
              name: string;
              habitIds: string[];
              enabled: boolean;
              lastImportedAt?: string;
            };
            return {
              id: d.id,
              name: d.name,
              habitIds: d.habitIds,
              enabled: d.enabled,
              lastImportedAt: d.lastImportedAt,
            };
          }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(60),
        habitIds: z.array(z.string().uuid()).min(1).max(20),
      })
      .safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: "Name the source and choose its habits." },
        { status: 400 },
      );
    const store = getStore(),
      habits = (await store.listHabits()).habits;
    if (
      parsed.data.habitIds.some(
        (id) => !habits.some((h) => h.id === id && !h.archived),
      )
    )
      return Response.json({ error: "Choose active habits." }, { status: 400 });
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await store.writeRecord(
      `config:integration:${id}`,
      {
        ...parsed.data,
        id,
        enabled: true,
        digest: createHash("sha256").update(token).digest("hex"),
      },
      null,
      randomUUID(),
    );
    return Response.json(
      { id, token, endpoint: `${new URL(request.url).origin}/api/ingest` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const { id } = await request.json(),
      store = getStore(),
      record = (await store.listRecords()).find(
        (r) => r.key === `config:integration:${id}`,
      );
    if (record)
      await store.writeRecord(
        record.key,
        { ...(record.data as object), enabled: false },
        record.revision,
        randomUUID(),
      );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

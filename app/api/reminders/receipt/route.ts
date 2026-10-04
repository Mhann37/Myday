import { randomUUID } from "node:crypto";
import { authorised, apiError } from "@/lib/api";
import { getStore } from "@/lib/store";
export async function POST(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const { id } = await request.json();
    if (!/^[a-f0-9]{64}$/.test(id))
      return Response.json({ error: "Invalid receipt" }, { status: 400 });
    const store = getStore(),
      r = (await store.listRecords()).find((r) => r.key === `delivery:${id}`);
    if (r)
      await store.writeRecord(
        r.key,
        {
          ...(r.data as object),
          state: "displayed",
          displayedAt: new Date().toISOString(),
        },
        r.revision,
        randomUUID(),
      );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

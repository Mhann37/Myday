import { randomUUID } from "node:crypto";
import { authorised, apiError } from "@/lib/api";
import { getStore } from "@/lib/store";
import { reminderSettingsSchema } from "@/lib/reminders";
import { sendPush, vapidKeys } from "@/lib/push";
import { ConflictError } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const id = new URL(request.url).searchParams.get("id"),
      records = await getStore().listRecords();
    return Response.json(
      {
        publicKey: vapidKeys().publicKey,
        schedulerConfigured: !!process.env.CRON_SECRET,
        settings: records.find((r) => r.key === `push:${id}`) ?? null,
        deliveries: records
          .filter(
            (r) =>
              r.key.startsWith("delivery:") &&
              (r.data as { deviceId: string }).deviceId === id,
          )
          .slice(-10)
          .map((r) => r.data),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const body = await request.json(),
      parsed = reminderSettingsSchema.safeParse(body.settings);
    if (!parsed.success)
      return Response.json(
        { error: "Check the reminder settings." },
        { status: 400 },
      );
    await getStore().writeRecord(
      `push:${parsed.data.id}`,
      parsed.data,
      body.expected ?? null,
      randomUUID(),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return e instanceof ConflictError
      ? Response.json({ error: e.message }, { status: 409 })
      : apiError(e);
  }
}
export async function POST(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const { id } = await request.json();
    const r = (await getStore().listRecords()).find(
      (r) => r.key === `push:${id}`,
    );
    if (!r)
      return Response.json(
        { error: "Enable reminders first." },
        { status: 400 },
      );
    await sendPush(reminderSettingsSchema.parse(r.data), {
      title: "My Day",
      body: "Reminders are connected. A small action is ready when you are.",
      url: "/habits",
      tag: "myday-test",
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const { id } = await request.json();
    const store = getStore(),
      r = (await store.listRecords()).find((r) => r.key === `push:${id}`);
    if (r)
      await store.writeRecord(
        r.key,
        { ...(r.data as object), enabled: false },
        r.revision,
        randomUUID(),
      );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

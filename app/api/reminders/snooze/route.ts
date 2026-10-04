import { randomUUID } from "node:crypto";
import { authorised, apiError } from "@/lib/api";
import { getStore } from "@/lib/store";
export async function POST(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const { id } = await request.json();
    if (!/^[a-f0-9]{64}$/.test(id))
      return Response.json({ error: "Invalid reminder" }, { status: 400 });
    const store = getStore(),
      records = await store.listRecords(),
      r = records.find((r) => r.key === `delivery:${id}`);
    if (!r)
      return Response.json({ error: "Reminder unavailable" }, { status: 404 });
    const data = r.data as {
      deviceId: string;
      reminder: {
        label: string;
        period: string | null;
        habitId: string | null;
        diaryDate: string;
      };
    };
    const key = `snooze:${id}`,
      existing = records.find((x) => x.key === key);
    await store.writeRecord(
      key,
      {
        deviceId: data.deviceId,
        due: new Date(Date.now() + 15 * 60000).toISOString(),
        done: false,
        label: data.reminder.label,
        url: data.reminder.period
          ? `/checkin/${data.reminder.period}`
          : "/habits",
        reminder: data.reminder,
      },
      existing?.revision ?? null,
      randomUUID(),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

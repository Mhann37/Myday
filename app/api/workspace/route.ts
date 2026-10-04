import { authorised, apiError } from "@/lib/api";
import { getStore } from "@/lib/store";
import { mutationSchema, ConflictError } from "@/lib/workspace";
import { habitSchema, maxHabitValue, preserveGoals } from "@/lib/habits";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const store = getStore();
    const { entries, habitData, records } = await store.snapshot();
    return Response.json(
      {
        entries,
        habitData,
        records: records.filter(
          (r) =>
            !r.key.startsWith("push:") &&
            !r.key.startsWith("delivery:") &&
            !r.key.startsWith("config:"),
        ),
      },
      { headers },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  try {
    const parsed = mutationSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: "Check the values and try again." },
        { status: 400 },
      );
    const m = parsed.data,
      store = getStore();
    let data: unknown = m.data;
    let key: string = m.key;
    if (m.kind === "entry") {
      if (m.data) key = `entry:${m.data.date}:${m.data.period}`;
      else if (!/^entry:\d{4}-\d{2}-\d{2}:(morning|night)$/.test(key))
        return Response.json({ error: "Invalid entry key" }, { status: 400 });
    }
    if (m.kind === "habit") {
      key = `habit:${m.data.id}`;
      const existing = (await store.listHabits()).habits.find(
        (h) => h.id === m.data.id,
      );
      if (m.effectiveFrom < (existing?.createdDate ?? m.data.createdDate))
        return Response.json(
          { error: "A goal cannot start before the habit." },
          { status: 400 },
        );
      data = preserveGoals(existing, m.data, m.effectiveFrom);
      const checked = habitSchema.safeParse(data);
      if (!checked.success)
        return Response.json(
          { error: "Check the goal history." },
          { status: 400 },
        );
    }
    if (m.kind === "log") {
      const l = m.data;
      key = `log:${l.habitId}:${l.date}`;
      const h = (await store.listHabits()).habits.find(
        (h) => h.id === l.habitId,
      );
      if (
        !h ||
        h.archived ||
        l.date < h.createdDate ||
        (l.value !== null &&
          (l.value > maxHabitValue(h) ||
            (h.kind === "check" && l.value !== 0 && l.value !== 1)))
      )
        return Response.json(
          { error: "This log is unavailable or outside its supported range." },
          { status: 400 },
        );
    }
    if (m.kind === "experiment") key = `experiment:${m.data.id}`;
    if (key !== m.key)
      return Response.json({ error: "Invalid record key" }, { status: 400 });
    await store.writeRecord(key, data, m.expected, m.id, m);
    return Response.json({ revision: m.id, data }, { headers });
  } catch (e) {
    if (e instanceof ConflictError)
      return Response.json({ error: e.message }, { status: 409, headers });
    return apiError(e);
  }
}

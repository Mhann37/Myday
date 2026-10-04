import { NextResponse } from "next/server";
import { habitLogSchema, habitSchema, maxHabitValue } from "@/lib/habits";
import { isAuthenticated } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

async function handle(request: Request, action: () => Promise<NextResponse>) {
  if (!(await isAuthenticated(request)))
    return NextResponse.json(
      { error: "Unauthorised" },
      { status: 401, headers },
    );
  if (
    request.method !== "GET" &&
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  ) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403, headers },
    );
  }
  try {
    return await action();
  } catch (error) {
    console.error("Habit request failed", error);
    return NextResponse.json(
      { error: "Couldn't save or load your habits. Please try again." },
      { status: 500, headers },
    );
  }
}

export async function GET(request: Request) {
  return handle(request, async () =>
    NextResponse.json(await getStore().listHabits(), { headers }),
  );
}

export async function PUT(request: Request) {
  return handle(request, async () => {
    const parsed = habitSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: "Check your habit name, target, and schedule." },
        { status: 400, headers },
      );
    const existing = (await getStore().listHabits()).habits.find(
      (h) => h.id === parsed.data.id,
    );
    const habit = {
      ...parsed.data,
      createdDate: existing?.createdDate ?? parsed.data.createdDate,
    };
    await getStore().upsertHabit(habit);
    return NextResponse.json({ habit }, { headers });
  });
}

export async function PATCH(request: Request) {
  return handle(request, async () => {
    const parsed = habitLogSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid habit log." },
        { status: 400, headers },
      );
    const { habitId, date, value } = parsed.data;
    const habit = (await getStore().listHabits()).habits.find(
      (h) => h.id === habitId,
    );
    if (!habit || habit.archived || date < habit.createdDate)
      return NextResponse.json(
        { error: "This habit is unavailable for that date." },
        { status: 400, headers },
      );
    if (value !== null && value > maxHabitValue(habit))
      return NextResponse.json(
        { error: "This amount is outside the supported range." },
        { status: 400, headers },
      );
    if (habit.kind === "check" && value !== null && value !== 0 && value !== 1)
      return NextResponse.json(
        { error: "Choose done or not done." },
        { status: 400, headers },
      );
    await getStore().logHabit(habitId, date, value);
    return NextResponse.json(
      { habitId, date, value, updatedAt: new Date().toISOString() },
      { headers },
    );
  });
}

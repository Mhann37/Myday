import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { dateSchema, periodSchema, putEntrySchema } from "@/lib/schema";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function fail(err: unknown) {
  console.error(err);
  return NextResponse.json(
    {
      error:
        "Couldn't load or save your diary. Your draft is kept on this device; please try again.",
    },
    { status: 500, headers: noStore },
  );
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const entries = await getStore().list();
    return NextResponse.json({ entries }, { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const parsed = putEntrySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid entry", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const { date, period, data } = parsed.data;
    const entry = await getStore().upsert(date, period, data);
    return NextResponse.json({ entry }, { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const date = dateSchema.safeParse(params.get("date"));
  const period = periodSchema.safeParse(params.get("period"));
  if (!date.success || !period.success)
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    await getStore().remove(date.data, period.data);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}

import { randomUUID } from "node:crypto";
import { ConflictError } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { dateSchema, periodSchema, putEntrySchema } from "@/lib/schema";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function fail(err: unknown) {
  if (err instanceof ConflictError)
    return NextResponse.json(
      { error: err.message },
      { status: 409, headers: noStore },
    );
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
    const key = `entry:${date}:${period}`,
      body = json as { expected?: string | null };
    const mutation = {
      kind: "entry" as const,
      key,
      id: randomUUID(),
      expected: body.expected ?? null,
      data: { date, period, data },
    };
    await getStore().writeRecord(
      key,
      mutation.data,
      mutation.expected,
      mutation.id,
      mutation,
    );
    const entry = (await getStore().list()).find(
      (e) => e.date === date && e.period === period,
    )!;
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
    const key = `entry:${date.data}:${period.data}`,
      mutation = {
        kind: "entry" as const,
        key,
        id: randomUUID(),
        expected: params.get("expected"),
        data: null,
      };
    await getStore().writeRecord(
      key,
      null,
      mutation.expected,
      mutation.id,
      mutation,
    );
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}

import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPasscode,
  createSessionToken,
  passcodeConfigured,
} from "@/lib/session";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!passcodeConfigured()) {
    return NextResponse.json(
      {
        error:
          "APP_PASSCODE is not set. Add it in your Vercel project settings, then redeploy.",
      },
      { status: 500 },
    );
  }

  let passcode = "";
  try {
    const body = (await request.json()) as { passcode?: unknown };
    if (typeof body.passcode === "string" && body.passcode.length <= 2000)
      passcode = body.passcode;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const store = getStore();
  if ((await store.recentFailures(WINDOW_MS)) >= MAX_FAILURES) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  if (!(await checkPasscode(passcode))) {
    await store.recordFailure();
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json(
      { error: "That passcode isn't right." },
      { status: 401 },
    );
  }

  await store.clearFailures();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

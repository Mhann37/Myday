import { NextResponse } from "next/server";
import { backupSchema } from "@/lib/backup";
import { isAuthenticated } from "@/lib/session";
import { getStore } from "@/lib/store";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!(await isAuthenticated(request)))
    return NextResponse.json(
      { error: "Unauthorised" },
      { status: 401, headers },
    );
  if (Number(request.headers.get("content-length")) > 8_000_000)
    return NextResponse.json(
      { error: "This backup is too large (8 MB maximum)." },
      { status: 413, headers },
    );
  let backup;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8_000_000)
      return NextResponse.json(
        { error: "This backup is too large (8 MB maximum)." },
        { status: 413, headers },
      );
    backup = backupSchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json(
      { error: "Choose a valid My Day JSON backup." },
      { status: 400, headers },
    );
  }
  if (!backup.success)
    return NextResponse.json(
      { error: "This file isn't a valid My Day backup." },
      { status: 400, headers },
    );
  try {
    return NextResponse.json(await getStore().restoreBackup(backup.data), {
      headers,
    });
  } catch (error) {
    console.error("Backup restore failed", error);
    return NextResponse.json(
      {
        error:
          "Couldn't restore this backup. Your existing data has been kept.",
      },
      { status: 500, headers },
    );
  }
}

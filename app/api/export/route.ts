import { NextResponse } from "next/server";
import { dailyCsv, habitsCsv, rawCsv } from "@/lib/export";
import { isAuthenticated } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAuthenticated(request)))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const format = new URL(request.url).searchParams.get("format") ?? "daily";
  const stamp = new Date().toISOString().slice(0, 10);
  const [entries, habits] = await Promise.all([
    getStore().list(),
    getStore().listHabits(),
  ]);

  const file = (body: string, name: string, ext: string, type: string) =>
    new NextResponse(body, {
      headers: {
        "Content-Type": `${type}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${name}-${stamp}.${ext}"`,
        "Cache-Control": "no-store",
      },
    });

  switch (format) {
    case "daily":
      return file(dailyCsv(entries, habits), "myday-daily", "csv", "text/csv");
    case "habits":
      return file(habitsCsv(habits), "myday-habits", "csv", "text/csv");
    case "raw":
      return file(rawCsv(entries), "myday-checkins", "csv", "text/csv");
    case "json":
      return file(
        JSON.stringify(
          {
            version: 2,
            exportedAt: new Date().toISOString(),
            entries,
            ...habits,
          },
          null,
          2,
        ),
        "myday-backup",
        "json",
        "application/json",
      );
    default:
      return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  }
}

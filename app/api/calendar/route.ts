import { authorised } from "@/lib/api";
export async function GET(request: Request) {
  const denial = await authorised(request);
  if (denial) return denial;
  const night = new URL(request.url).searchParams.get("period") === "night",
    period = night ? "night" : "morning";
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Day//Reminders//EN",
    "BEGIN:VEVENT",
    `UID:myday-${period}@myday.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${new Date(Date.now() + 86400000).toISOString().slice(0, 10).replaceAll("-", "")}T${night ? "203000" : "080000"}`,
    `SUMMARY:My Day ${period} check-in`,
    `URL:${new URL(request.url).origin}/checkin/${period}`,
    "RRULE:FREQ=DAILY",
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:A moment to notice your day",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="myday-${period}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

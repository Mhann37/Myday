import { timingSafeEqual } from "node:crypto";
import { dispatchReminders } from "@/lib/push";
import { apiError } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    token = request.headers.get("authorization");
  if (
    !secret ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(`Bearer ${secret}`) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(`Bearer ${secret}`))
  )
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  try {
    return Response.json(await dispatchReminders(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}

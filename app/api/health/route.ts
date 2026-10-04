import { getStore } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getStore().list();
    return Response.json(
      { status: "ok", storage: "reachable" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}

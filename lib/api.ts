import { isAuthenticated } from "./session";
export async function authorised(request: Request) {
  if (!(await isAuthenticated(request)))
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (
    request.method !== "GET" &&
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  return null;
}
export function apiError(error: unknown) {
  console.error(
    "My Day request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return Response.json(
    {
      error:
        "Couldn't save or load. Please retry; your unsynced changes are kept on this device.",
    },
    { status: 500 },
  );
}

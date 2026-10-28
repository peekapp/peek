import { databasePath, installationTimeZone } from "@peek/db";
import { openExtensions } from "@peek/extensions/store";
import { settingsRequestAllowed } from "../../../../../lib/request-access";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  if (!settingsRequestAllowed(request)) return new Response(null, { status: 403, headers });
  let store: ReturnType<typeof openExtensions> | undefined;
  try {
    const { id } = await params;
    store = openExtensions(databasePath());
    return Response.json({ cards: store.scenarioCards(id), timeZone: installationTimeZone() }, { headers });
  } catch (error) {
    const missing = error instanceof Error && error.message === "scenario-not-found";
    return Response.json({ error: missing ? "scenario-not-found" : "cards-unavailable" }, { status: missing ? 404 : 503, headers });
  } finally { store?.close(); }
}

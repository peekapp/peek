import { readSettings } from "../../../lib/settings-data";
import { databasePath, openStore } from "@peek/db";
export const dynamic = "force-dynamic";
import { settingsRequestAllowed } from "../../../lib/request-access";
export function GET(request: Request) {
  if (!settingsRequestAllowed(request))
    return new Response(null, { status: 403 });
  try {
    return Response.json(readSettings(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!settingsRequestAllowed(request, true))
    return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response(null, { status: 415 });
  let body;
  try {
    const text = await request.text();
    if (text.length > 10000) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (!body || typeof body !== "object")
    return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const store = openStore(databasePath());
    try {
      let createdId: string | undefined;
      if (body.action === "screen-save") {
        createdId = body.id;
        store.saveScreen(createdId!, body.config, body.previousId ?? null);
      } else if (
        body.action === "screen-delete" &&
        typeof body.id === "string"
      ) {
        store.deleteScreen(body.id);
      } else if (body.action === "profile-save") {
        createdId = body.id ?? `profile-${crypto.randomUUID()}`;
        store.saveProfile(createdId!, body.config);
      } else if (
        body.action === "profile-delete" &&
        typeof body.id === "string"
      ) {
        store.deleteProfile(body.id);
      } else if (body.action === "theme") store.setTheme(body.theme);
      else if (body.action === "locale") store.setLocale(body.locale);
      else throw new Error("invalid");
      return Response.json({ ok: true, id: createdId });
    } finally {
      store.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "invalid-screen",
      "invalid-screen-id",
      "screen-id-taken",
      "screen-not-found",
      "invalid-profile",
      "profile-in-use",
      "invalid",
    ];
    return Response.json(
      { error: known.includes(message) ? message : "unavailable" },
      { status: known.includes(message) ? 400 : 503 },
    );
  }
}

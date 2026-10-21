import { databasePath, openStore } from "@peek/db";
export const dynamic = "force-dynamic";
// Local-only administration until administrator authentication is implemented.
function local(request: Request, mutate = false) {
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const address = new URL(`http://${host}`);
    if (
      address.host !== host ||
      !["127.0.0.1", "localhost", "[::1]"].includes(address.hostname)
    )
      return false;
    // Next.js may normalize request.url to the listening address. Validate the
    // actual Host header and browser Origin instead of that internal URL.
    return (
      !mutate ||
      request.headers.get("origin") ===
        `${new URL(request.url).protocol}//${host}`
    );
  } catch {
    return false;
  }
}
export function GET(request: Request) {
  if (!local(request)) return new Response(null, { status: 403 });
  try {
    const store = openStore(databasePath(), true);
    try {
      return Response.json(
        {
          scenarios: store.listScenarios(),
          calendars: store.listCalendars(),
          connections: store
            .listCalendars()
            .map((c) => ({ ...c, integrationId: "ical" })),
          locale: store.snapshot().locale,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      store.close();
    }
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!local(request, true)) return new Response(null, { status: 403 });
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
  if (body.action === "connection-check") body.action = "calendar-sync";
  try {
    const store = openStore(databasePath());
    try {
      if (
        body.action?.startsWith("calendar-") &&
        body.id !== undefined &&
        (typeof body.id !== "string" ||
          !/^cal-[a-zA-Z0-9-]{1,80}$/.test(body.id))
      )
        throw new Error("invalid-calendar");
      let createdId: string | undefined;
      let checkedAt: number | null | undefined;
      if (body.action === "calendar-save") {
        createdId = body.id ?? `cal-${crypto.randomUUID()}`;
        store.saveCalendar(createdId!, body.config, body.url);
      } else if (
        body.action === "calendar-delete" &&
        typeof body.id === "string"
      )
        store.deleteCalendar(body.id);
      else if (body.action === "calendar-sync" && typeof body.id === "string") {
        const connection = store.listCalendars().find((c) => c.id === body.id);
        if (!connection) throw new Error("invalid-calendar");
        checkedAt = connection.checkedAt;
        store.requestSync(body.id);
      } else if (body.action === "locale") store.setLocale(body.locale);
      else if (body.action === "save") {
        if (
          body.id !== undefined &&
          (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(body.id))
        )
          throw new Error("invalid");
        createdId = body.id ?? crypto.randomUUID();
        store.saveScenario(createdId!, body.config);
      } else if (body.action === "delete" && typeof body.id === "string")
        store.deleteScenario(body.id);
      else throw new Error("invalid");
      return Response.json({ ok: true, id: createdId, checkedAt });
    } finally {
      store.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "invalid",
      "invalid-calendar",
      "invalid-url",
      "calendar-in-use",
      "encryption-key",
    ];
    return Response.json(
      { error: known.includes(message) ? message : "unavailable" },
      { status: known.includes(message) ? 400 : 503 },
    );
  }
}

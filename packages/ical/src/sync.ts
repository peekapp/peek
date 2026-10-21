import type { openStore } from "@peek/db";
import type { CalendarEvent } from "@peek/core/scenarios";
import { fetchCalendar } from "./fetch";
import { fileURLToPath } from "node:url";
type Store = ReturnType<typeof openStore>;
export async function syncCalendar(
  store: Store,
  row: ReturnType<Store["dueCalendars"]>[number],
  download = fetchCalendar,
) {
  try {
    const url = store.calendarUrl(row.secret);
    const response = await download(
      url,
      row.cache
        ? {
            ...(row.etag ? { "If-None-Match": row.etag } : {}),
            ...(row.modified ? { "If-Modified-Since": row.modified } : {}),
          }
        : {},
    );
    const body =
      response.status === 304 && row.cache
        ? store.calendarUrl(row.cache)
        : response.body;
    const subprocess = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL("./parse-cli.ts", import.meta.url)),
      ],
      {
        env: { ...process.env, TZ: row.config.timeZone },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
      },
    );
    const timeout = setTimeout(() => subprocess.kill(), 10000);
    let events: CalendarEvent[];
    try {
      subprocess.stdin.write(
        JSON.stringify({
          body,
          id: row.id,
          config: row.config,
          now: Date.now(),
        }),
      );
      subprocess.stdin.end();
      const [output, exit] = await Promise.all([
        new Response(subprocess.stdout).text(),
        subprocess.exited,
      ]);
      if (exit !== 0) throw new Error("invalid-calendar");
      events = JSON.parse(output);
    } finally {
      clearTimeout(timeout);
    }
    store.completeSync(row.id, row.version, {
      events,
      cache: body,
      etag:
        response.etag ??
        (response.status === 304 ? row.etag ?? undefined : undefined),
      modified:
        response.modified ??
        (response.status === 304 ? row.modified ?? undefined : undefined),
    });
  } catch (error) {
    const known = [
      "blocked-address",
      "invalid-url",
      "http-error",
      "too-large",
      "timeout",
      "redirect-limit",
      "encryption-key",
      "invalid-calendar",
    ];
    const code =
      error instanceof Error && known.includes(error.message)
        ? error.message
        : "network-error";
    store.completeSync(row.id, row.version, { error: code });
  }
}

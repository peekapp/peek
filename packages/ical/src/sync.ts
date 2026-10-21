import type { openStore } from "@peek/db";
import type { CalendarEvent } from "@peek/core/scenarios";
import { createCalendarIntegration } from "./integration";
import type { Json } from "@peekapp/sdk";
import { fetchCalendar } from "./fetch";
import { fileURLToPath } from "node:url";
type Store = ReturnType<typeof openStore>;
export async function syncCalendar(
  store: Store,
  row: ReturnType<Store["dueCalendars"]>[number],
  download = fetchCalendar,
) {
  try {
    const handler = createCalendarIntegration(
      download,
      async (body, id, config, now) => {
        const subprocess = Bun.spawn(
          [
            process.execPath,
            fileURLToPath(new URL("./parse-cli.ts", import.meta.url)),
          ],
          {
            env: { ...process.env, TZ: config.timeZone },
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
              id,
              config,
              now,
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
        return events;
      },
    );
    const result = await handler.run({
      settings: { ...row.config, sourceId: row.id } as unknown as Json,
      secrets: { url: store.calendarUrl(row.secret) },
      state: {
        body: row.cache ? store.calendarUrl(row.cache) : null,
        etag: row.etag,
        modified: row.modified,
      },
      now: Date.now(),
      signal: new AbortController().signal,
      publish: async () => {},
    });
    store.completeSync(row.id, row.version, {
      events: result.datasets.events as unknown as CalendarEvent[],
      cache: result.state.body,
      etag: result.state.etag ?? undefined,
      modified: result.state.modified ?? undefined,
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

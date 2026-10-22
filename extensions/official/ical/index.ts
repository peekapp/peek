import { defineIntegration } from "@peekapp/sdk/integration";
import type { Json } from "@peekapp/sdk";
import { fetchCalendar } from "./fetch";
import { parseCalendar } from "./parse";

export default defineIntegration({
  async run({ settings, secrets, now, signal }) {
    const { timeZone, intervalSeconds } = settings as {
      timeZone: string;
      intervalSeconds: number;
    };
    new Intl.DateTimeFormat("en", { timeZone }).format();
    // Each connection has its own Node process. Floating ICS dates use its zone.
    process.env.TZ = timeZone;
    const response = await fetchCalendar(
      String(secrets.url),
      {},
      undefined,
      signal,
    );
    signal.throwIfAborted();
    const events = parseCalendar(response.body, { timeZone }, now);
    return {
      datasets: { events: JSON.parse(JSON.stringify(events)) as Json },
      // Re-fetch so recurring event expansion advances even for unchanged feeds.
      // Calendar contents stay out of the bounded 1 MiB instance state.
      state: null,
      nextRunAt: now + intervalSeconds * 1000,
    };
  },
});

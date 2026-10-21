import {
  defineIntegration,
  type IntegrationContext,
} from "@peekapp/sdk/integration";
import type { Json } from "@peekapp/sdk";
import type { CalendarConfig } from "@peek/core/calendars";
import type { CalendarEvent } from "@peek/core/scenarios";
import { fetchCalendar } from "./fetch";
import { parseCalendar } from "./parse";
export type CalendarParser = (
  body: string,
  id: string,
  config: CalendarConfig,
  now: number,
) => CalendarEvent[] | Promise<CalendarEvent[]>;
/** Host can supply its existing isolated parser; packaged execution uses its container. */
export function createCalendarIntegration(
  download = fetchCalendar,
  parse: CalendarParser = parseCalendar,
) {
  return defineIntegration({
    async run({ settings, secrets, state, now }: IntegrationContext) {
      const config = settings as unknown as CalendarConfig & {
        sourceId: string;
      };
      const previous = (state ?? {}) as {
        body?: string;
        etag?: string;
        modified?: string;
      };
      const response = await download(
        String(secrets.url),
        previous.body
          ? {
              ...(previous.etag ? { "If-None-Match": previous.etag } : {}),
              ...(previous.modified
                ? { "If-Modified-Since": previous.modified }
                : {}),
            }
          : {},
      );
      const body =
        response.status === 304 && previous.body
          ? previous.body
          : response.body;
      const events = await parse(body, config.sourceId, config, now);
      return {
        datasets: { events: events as unknown as Json },
        state: {
          body,
          etag:
            response.etag ??
            (response.status === 304 ? previous.etag : null) ??
            null,
          modified:
            response.modified ??
            (response.status === 304 ? previous.modified : null) ??
            null,
        },
        nextRunAt: now + config.intervalSeconds * 1000,
      };
    },
  });
}
export default createCalendarIntegration();

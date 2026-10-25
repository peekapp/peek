import { defineConnection } from "@peekapp/sdk/connection";
import type { Events } from "@peekapp/sdk/contracts/events";
export default defineConnection({
  run({ now }) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const data: Events = {
      from: now,
      to: now + 2 * 86400000,
      events: [
        {
          id: `birthday:${date}`,
          title: "Example birthday",
          kind: "all-day",
          startDate: date,
          timeZone: "UTC",
        },
      ],
    };
    return { datasets: { events: data }, nextRunAt: now + 60000 };
  },
});

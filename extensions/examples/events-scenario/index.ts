import { createHash } from "node:crypto";
import { defineScenario } from "@peekapp/sdk/scenario";
import type { Events } from "@peekapp/sdk/contracts/events";
export default defineScenario({
  evaluate({ inputs, now }) {
    return {
      cards: (inputs.events ?? []).flatMap((source) =>
        (source.data as unknown as Events).events.map((event) => ({
          id: createHash("sha256")
            .update(JSON.stringify([source.connectionId, event.id]))
            .digest("hex"),
          title: event.title,
          body:
            event.kind === "all-day"
              ? `${event.startDate} (${event.timeZone})`
              : new Date(event.startAt).toISOString(),
          targetAt: now + 60000,
          visibleFrom: now,
          expiresAt: now + 60000,
        })),
      ),
      nextRunAt: now + 60000,
    };
  },
});

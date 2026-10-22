import { createHash } from "node:crypto";
import { defineScenario, type ScenarioCard } from "@peekapp/sdk/scenario";
import type { CalendarEvent } from "./calendar";
export function calendarScenario(kind: "meeting" | "deadline") {
  return defineScenario({
    evaluate({ settings, inputs, now }) {
      const config = settings as {
        leadMinutes: number;
        urgentMinutes: number;
        retainMinutes: number;
        filterText: string;
      };
      if (config.leadMinutes <= config.urgentMinutes)
        throw new Error("lead-must-exceed-urgent");
      const cards: ScenarioCard[] = [];
      let nextRunAt: number | null = null;
      const filter = config.filterText.toLowerCase();
      for (const snapshot of inputs.events ?? []) {
        for (const event of snapshot.data as unknown as CalendarEvent[]) {
          if (
            !event.title.toLowerCase().includes(filter) ||
            (kind === "meeting" && event.allDay)
          )
            continue;
          const targetAt =
            kind === "deadline"
              ? (event.deadlineAt ?? event.startAt)
              : event.startAt;
          const visibleFrom = targetAt - config.leadMinutes * 60000;
          const urgentAt = targetAt - config.urgentMinutes * 60000;
          const expiresAt = Math.min(
            targetAt + config.retainMinutes * 60000,
            kind === "meeting" ? (event.endAt ?? Infinity) : Infinity,
          );
          for (const boundary of [visibleFrom, urgentAt, targetAt, expiresAt])
            if (boundary > now && (nextRunAt === null || boundary < nextRunAt))
              nextRunAt = boundary;
          if (visibleFrom <= now && now < expiresAt)
            cards.push({
              // A short stable ID also accommodates long provider UIDs.
              id: createHash("sha256")
                .update(JSON.stringify([snapshot.connectionId, event.id]))
                .digest("hex"),
              kind,
              title: event.title,
              location: event.location,
              targetAt,
              visibleFrom,
              urgentAt,
              expiresAt,
              priority: kind === "meeting" ? 2 : 1,
              urgentPriority: kind === "meeting" ? 3 : 2,
            });
        }
      }
      return { cards, nextRunAt };
    },
  });
}

import * as ical from "node-ical";
import { DateTime } from "luxon";

import type { Event, Events } from "@peekapp/sdk/contracts/events";
const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && "val" in value
      ? String(value.val)
      : "";
export function parseCalendar(
  body: string,
  config: { timeZone: string },
  now: number,
): Events {
  if (
    !/^BEGIN:VCALENDAR\s*$/im.test(body) ||
    !/^END:VCALENDAR\s*$/im.test(body)
  )
    throw new Error("invalid-calendar");
  const parsed = ical.sync.parseICS(body);
  const output = new Map<string, Event>();
  const from = now - 2 * 86400000,
    to = now + 90 * 86400000;
  for (const base of Object.values(parsed)) {
    if (!base || base.type !== "VEVENT") continue;
    if (!base.start || !base.uid || base.uid.length > 2048)
      throw new Error("invalid-calendar");
    if (base.status === "CANCELLED") continue;
    if (base.rrule && /FREQ=SECONDLY/i.test(base.rrule.toString()))
      throw new Error("invalid-calendar");
    const instances = ical.expandRecurringEvent(base, {
      from: new Date(from),
      to: new Date(to),
      expandOngoing: true,
    });
    for (const instance of instances) {
      if (instance.event.status === "CANCELLED") continue;
      const startAt = instance.start.getTime();
      const endAt = instance.end.getTime();
      if (
        !Number.isFinite(startAt) ||
        !Number.isFinite(endAt) ||
        endAt < startAt
      )
        throw new Error("invalid-calendar");
      // RECURRENCE-ID remains stable when an individual occurrence is moved.
      const occurrence = instance.event.recurrenceid?.getTime() ?? startAt;
      const id = `${base.uid}:${occurrence}`;
      const allDay = instance.isFullDay;
      const zone = instance.start.tz || config.timeZone;
      const startDate = allDay
        ? DateTime.fromMillis(startAt, { zone }).toISODate()
        : null;
      const endDate = allDay
        ? DateTime.fromMillis(endAt, { zone }).toISODate()
        : null;
      if (allDay && (!startDate || !endDate))
        throw new Error("invalid-calendar");
      output.set(id, {
        id,
        title: text(instance.summary).slice(0, 1000) || "(Untitled)",
        ...(allDay
          ? {
              kind: "all-day" as const,
              startDate: startDate!,
              ...(endDate! > startDate! ? { endDate: endDate! } : {}),
              timeZone: zone,
            }
          : {
              kind: "timed" as const,
              startAt,
              ...(endAt > startAt ? { endAt } : {}),
            }),
        location: text(instance.event.location).slice(0, 1000) || undefined,
      });
      if (output.size > 10000) throw new Error("too-many-events");
    }
  }
  return { from, to, events: [...output.values()] };
}

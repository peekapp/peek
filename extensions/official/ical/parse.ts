import * as ical from "node-ical";
import { DateTime } from "luxon";

import type { CalendarEvent } from "../calendar";
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
): CalendarEvent[] {
  if (
    !/^BEGIN:VCALENDAR\s*$/im.test(body) ||
    !/^END:VCALENDAR\s*$/im.test(body)
  )
    throw new Error("invalid-calendar");
  const parsed = ical.sync.parseICS(body);
  const output = new Map<string, CalendarEvent>();
  for (const base of Object.values(parsed)) {
    if (!base || base.type !== "VEVENT") continue;
    if (!base.start || !base.uid || base.uid.length > 2048)
      throw new Error("invalid-calendar");
    if (base.status === "CANCELLED") continue;
    if (base.rrule && /FREQ=SECONDLY/i.test(base.rrule.toString()))
      throw new Error("invalid-calendar");
    const instances = ical.expandRecurringEvent(base, {
      from: new Date(now - 2 * 86400000),
      to: new Date(now + 90 * 86400000),
      expandOngoing: true,
    });
    for (const instance of instances) {
      if (instance.event.status === "CANCELLED") continue;
      const startAt = instance.start.getTime();
      const endAt = instance.end.getTime();
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt))
        throw new Error("invalid-calendar");
      // RECURRENCE-ID remains stable when an individual occurrence is moved.
      const occurrence = instance.event.recurrenceid?.getTime() ?? startAt;
      const id = `${base.uid}:${occurrence}`;
      const allDay = instance.isFullDay;
      const zone = instance.start.tz || config.timeZone;
      const deadlineAt = allDay
        ? DateTime.fromMillis(startAt, { zone })
            .startOf("day")
            .plus({ days: 1 })
            .toMillis() - 1
        : startAt;
      if (!Number.isFinite(deadlineAt)) throw new Error("invalid-calendar");
      output.set(id, {
        id,
        title: text(instance.summary).slice(0, 1000) || "(Untitled)",
        startAt,
        endAt,
        allDay,
        deadlineAt,
        location: text(instance.event.location).slice(0, 1000) || undefined,
      });
      if (output.size > 10000) throw new Error("too-many-events");
    }
  }
  return [...output.values()];
}

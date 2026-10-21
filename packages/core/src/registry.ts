import type { CalendarConnection } from "./calendars";

// Build-time definitions. Instances reference these IDs; secrets stay server-side.
export const integrationDefinitions = [
  {
    id: "ical",
    name: "iCalendar",
    icon: { src: "/integrations/ical.svg" },
    descriptionKey: "icalDescription",
    capabilities: ["calendar.events"],
  },
] as const;
export const scenarioDefinitions = [
  {
    id: "meetings",
    nameKey: "meetings",
    descriptionKey: "meetingsDescription",
    requires: ["calendar.events"],
  },
  {
    id: "deadlines",
    nameKey: "deadlines",
    descriptionKey: "deadlinesDescription",
    requires: ["calendar.events"],
  },
] as const;
export type Connection = CalendarConnection & { integrationId: "ical" };

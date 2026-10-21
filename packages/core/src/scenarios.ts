import type { Card, Owner } from "./cards";
export type CalendarEvent = {
  id: string;
  sourceId: string;
  title: string;
  owner: Owner;
  startAt: number;
  endAt?: number;
  location?: string;
  allDay?: boolean;
  deadlineAt?: number;
};
export type ScenarioConfig = {
  profileId?: string;
  name: string;
  definition: "meetings" | "deadlines";
  sourceIds: string[];
  enabled: boolean;
  leadMinutes: number;
  urgentMinutes: number;
  retainMinutes: number;
  filterText: string;
};
export type Scenario = ScenarioConfig & {
  id: string;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastError: string | null;
};
export const definitions = {
  meetings: {
    id: "meetings",
    version: 1,
    capability: "calendar.events",
    defaults: { leadMinutes: 10, urgentMinutes: 1, retainMinutes: 5 },
  },
  deadlines: {
    id: "deadlines",
    version: 1,
    capability: "calendar.events",
    defaults: { leadMinutes: 10080, urgentMinutes: 1440, retainMinutes: 1440 },
  },
} as const;
export const numericFields = [
  "leadMinutes",
  "urgentMinutes",
  "retainMinutes",
] as const;
export function validateConfig(input: unknown): ScenarioConfig {
  if (!input || typeof input !== "object") throw new Error("invalid");
  const v = input as ScenarioConfig & { sourceId?: unknown };
  // Accept older clients during the transition; only persist the plural form.
  const sourceIds =
    v.sourceIds ?? (typeof v.sourceId === "string" ? [v.sourceId] : []);
  if (
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 100 ||
    !["meetings", "deadlines"].includes(v.definition) ||
    !Array.isArray(sourceIds) ||
    sourceIds.length === 0 ||
    sourceIds.length > 100 ||
    sourceIds.some(
      (id) => typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id),
    ) ||
    typeof v.enabled !== "boolean" ||
    typeof v.filterText !== "string" ||
    v.filterText.length > 200 ||
    numericFields.some(
      (key) => !Number.isInteger(v[key]) || v[key] < 0 || v[key] > 129600,
    ) ||
    v.leadMinutes <= v.urgentMinutes ||
    v.retainMinutes > 1440
  )
    throw new Error("invalid");
  return {
    profileId: v.profileId,
    name: v.name.trim(),
    definition: v.definition,
    sourceIds: [...new Set(sourceIds)],
    enabled: v.enabled,
    leadMinutes: v.leadMinutes,
    urgentMinutes: v.urgentMinutes,
    retainMinutes: v.retainMinutes,
    filterText: v.filterText.trim(),
  };
}
// Trusted local handler: receives only explicitly bound events and settings.
export function evaluateScenario(
  scenario: Scenario,
  events: readonly CalendarEvent[],
  now: number,
) {
  if (!definitions[scenario.definition]) throw new Error("unknown-definition");
  const result: Card[] = [];
  const boundaries: number[] = [];
  const sources = new Set(scenario.sourceIds);
  for (const event of events) {
    if (
      !sources.has(event.sourceId) ||
      !event.title.toLowerCase().includes(scenario.filterText.toLowerCase())
    )
      continue;
    if (scenario.definition === "meetings" && event.allDay) continue;
    const targetAt =
      scenario.definition === "deadlines"
        ? (event.deadlineAt ?? event.startAt)
        : event.startAt;
    const visibleFrom = targetAt - scenario.leadMinutes * 60000;
    const urgentAt = targetAt - scenario.urgentMinutes * 60000;
    const expiresAt = Math.min(
      targetAt + scenario.retainMinutes * 60000,
      scenario.definition === "meetings" ? (event.endAt ?? Infinity) : Infinity,
    );
    boundaries.push(visibleFrom, urgentAt, targetAt, expiresAt);
    if (visibleFrom <= now && now < expiresAt)
      result.push({
        id: `${scenario.id}:${event.sourceId}:${event.id}`,
        sourceId: event.sourceId,
        kind: scenario.definition === "meetings" ? "meeting" : "deadline",
        title: event.title,
        owner: event.owner,
        location: event.location,
        targetAt,
        visibleFrom,
        urgentAt,
        expiresAt,
        priority: scenario.definition === "meetings" ? 2 : 1,
        urgentPriority: scenario.definition === "meetings" ? 3 : 2,
      });
  }
  const next = boundaries.filter((t) => t > now);
  return { cards: result, nextRunAt: next.length ? Math.min(...next) : null };
}

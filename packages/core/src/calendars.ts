import type { Owner } from "./cards";
export type CalendarConfig = {
  profileId?: string;
  name: string;
  owner: Owner;
  timeZone: string;
  intervalSeconds: number;
};
export type CalendarConnection = CalendarConfig & {
  id: string;
  version: number;
  lastSuccess: number | null;
  checkedAt: number | null;
  nextSync: number;
  error: string | null;
  failures: number;
  eventCount: number;
};
export function validateCalendar(input: unknown): CalendarConfig {
  if (!input || typeof input !== "object") throw new Error("invalid-calendar");
  const c = input as CalendarConfig;
  if (
    typeof c.name !== "string" ||
    !c.name.trim() ||
    c.name.length > 100 ||
    !c.owner ||
    typeof c.owner.name !== "string" ||
    !c.owner.name.trim() ||
    c.owner.name.length > 100 ||
    !["blue", "pink", "green"].includes(c.owner.color) ||
    !Number.isInteger(c.intervalSeconds) ||
    c.intervalSeconds < 60 ||
    c.intervalSeconds > 86400 ||
    typeof c.timeZone !== "string"
  )
    throw new Error("invalid-calendar");
  try {
    new Intl.DateTimeFormat("en", { timeZone: c.timeZone }).format();
  } catch {
    throw new Error("invalid-calendar");
  }
  return {
    profileId: c.profileId,
    name: c.name.trim(),
    owner: { name: c.owner.name.trim(), color: c.owner.color },
    timeZone: c.timeZone,
    intervalSeconds: c.intervalSeconds,
  };
}
export function validateCalendarUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096)
    throw new Error("invalid-url");
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== "443")
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error("invalid-url");
  }
}

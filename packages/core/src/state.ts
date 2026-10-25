import type { Card } from "./cards";
export type ScreenState = {
  timeZone?: string;
  theme?: import("./themes").Theme;
  screen?: import("./screens").Screen;
  cards: Card[];
  revision: number;
  heartbeat: number | null;
  serverTime: number;
  locale?: "en" | "ru";
  scenarioErrors?: number;
  connectionErrors?: number;
};
export function workerHealthy(heartbeat: number | null, now: number) {
  return heartbeat !== null && now - heartbeat <= 30_000;
}

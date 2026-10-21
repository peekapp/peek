import type { Card } from "./cards";
export type ScreenState = {
  cards: Card[];
  revision: number;
  heartbeat: number | null;
  serverTime: number;
  locale?: "en" | "ru";
  scenarioErrors?: number;
};
export function workerHealthy(heartbeat: number | null, now: number) {
  return heartbeat !== null && now - heartbeat <= 30_000;
}

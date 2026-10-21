import type { Json, Snapshot, Migrator } from "./index.js";
export type ScenarioCard = {
  id: string;
  kind?: "info" | "meeting" | "deadline";
  title: string;
  body?: string;
  location?: string;
  targetAt: number;
  visibleFrom: number;
  expiresAt: number;
  urgentAt?: number;
  priority?: number;
  urgentPriority?: number;
};
export type ScenarioContext = {
  settings: Json;
  state: Json;
  now: number;
  inputs: Record<string, Snapshot[]>;
};
export type ScenarioResult = {
  cards: ScenarioCard[];
  state?: Json;
  nextRunAt: number | null;
};
export type ScenarioDefinition = {
  evaluate(context: ScenarioContext): ScenarioResult | Promise<ScenarioResult>;
  migrate?: Migrator;
};
export function defineScenario<T extends ScenarioDefinition>(definition: T): T {
  return definition;
}

import type { Json, Migrator } from "./index.js";
export type IntegrationUpdate = {
  datasets: Record<string, Json>;
  state?: Json;
  nextRunAt?: number | null;
};
export type IntegrationContext = {
  settings: Json;
  secrets: Record<string, Json>;
  state: Json;
  now: number;
  signal: AbortSignal;
  /** Publishes a complete replacement snapshot. Resolves after local protocol output. */
  publish(update: IntegrationUpdate): Promise<void>;
};
export type IntegrationDefinition = {
  /** May return a snapshot or remain alive and publish snapshots until aborted. */
  run(
    context: IntegrationContext,
  ): IntegrationUpdate | void | Promise<IntegrationUpdate | void>;
  migrate?: Migrator;
};
export function defineIntegration<T extends IntegrationDefinition>(
  definition: T,
): T {
  return definition;
}

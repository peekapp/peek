import type { Json, Migrator } from "./index.js";
export type ConnectionUpdate = {
  datasets: Record<string, Json>;
  state?: Json;
  nextRunAt?: number | null;
};
export type ConnectionContext = {
  settings: Json;
  secrets: Record<string, Json>;
  state: Json;
  now: number;
  signal: AbortSignal;
  /** Publishes a complete replacement snapshot. Resolves after local protocol output. */
  publish(update: ConnectionUpdate): Promise<void>;
};
export type ConnectionDefinition = {
  /** May return a snapshot or remain alive and publish snapshots until aborted. */
  run(
    context: ConnectionContext,
  ): ConnectionUpdate | void | Promise<ConnectionUpdate | void>;
  migrate?: Migrator;
};
export function defineConnection<T extends ConnectionDefinition>(
  definition: T,
): T {
  return definition;
}

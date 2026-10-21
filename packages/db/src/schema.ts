import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Card } from "@peek/core";
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<Card>().notNull(),
  scenarioId: text("scenario_id"),
  expiresAt: integer("expires_at").notNull(),
});
export const state = sqliteTable("screen_state", {
  id: integer("id").primaryKey(),
  revision: integer("revision").notNull(),
  heartbeat: integer("heartbeat"),
  locale: text("locale").$type<"en" | "ru">().notNull(),
  demoSeeded: integer("demo_seeded", { mode: "boolean" }).notNull(),
});

import type { ScenarioConfig, CalendarEvent } from "@peek/core/scenarios";
export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  config: text("config", { mode: "json" }).$type<ScenarioConfig>().notNull(),
  nextRunAt: integer("next_run_at"),
  lastRunAt: integer("last_run_at"),
  lastError: text("last_error"),
});
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<CalendarEvent>().notNull(),
});

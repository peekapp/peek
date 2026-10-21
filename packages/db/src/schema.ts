import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ProfileColor } from "@peek/core/colors";
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
  theme: text("theme").$type<import("@peek/core/themes").Theme>().notNull(),
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

import type { CalendarConfig } from "@peek/core/calendars";
export const calendars = sqliteTable("calendars", {
  id: text("id").primaryKey(),
  config: text("config", { mode: "json" }).$type<CalendarConfig>().notNull(),
  secret: text("secret").notNull(),
  version: integer("version").notNull(),
  lastSuccess: integer("last_success"),
  checkedAt: integer("checked_at"),
  nextSync: integer("next_sync").notNull(),
  error: text("error"),
  failures: integer("failures").notNull(),
  cache: text("cache"),
  eventCount: integer("event_count").notNull(),
  etag: text("etag"),
  modified: text("modified"),
});

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").$type<ProfileColor>().notNull(),
  system: integer("system", { mode: "boolean" }).notNull(),
});

import type { ScreenConfig } from "@peek/core/screens";
export const screens = sqliteTable("screens", {
  id: text("id").primaryKey(),
  config: text("config", { mode: "json" }).$type<ScreenConfig>().notNull(),
});

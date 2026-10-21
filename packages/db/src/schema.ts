import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Card } from "@peek/core";
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<Card>().notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const state = sqliteTable("screen_state", {
  id: integer("id").primaryKey(),
  revision: integer("revision").notNull(),
  heartbeat: integer("heartbeat"),
  demoSeeded: integer("demo_seeded", { mode: "boolean" }).notNull(),
});

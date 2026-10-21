import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, lte, sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Card } from "@peek/core";
import type { ScreenState } from "@peek/core/state";
import { cards, state } from "./schema";

export function databasePath() {
  const path = process.env.PEEK_DATABASE_PATH;
  if (path && !isAbsolute(path))
    throw new Error("PEEK_DATABASE_PATH must be absolute");
  // Both web and worker scripts run from apps/<name>.
  return path ?? resolve(process.cwd(), "../../data/peek.sqlite");
}

export function openStore(path: string, readonly = false) {
  if (!readonly && path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { readonly, create: !readonly });
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  const db = drizzle(sqlite);
  return {
    close() {
      sqlite.close();
    },
    migrate() {
      sqlite.exec("PRAGMA journal_mode = WAL;");
      // Versioned migration: schema and version are committed together.
      sqlite
        .transaction(() => {
          const version = (
            sqlite.query("PRAGMA user_version").get() as {
              user_version: number;
            }
          ).user_version;
          if (version > 1)
            throw new Error("Database schema is newer than this application");
          if (version === 0)
            sqlite.exec(`
          CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
          CREATE INDEX cards_expiry ON cards(expires_at);
          CREATE TABLE screen_state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, heartbeat INTEGER, demo_seeded INTEGER NOT NULL DEFAULT 0);
          INSERT INTO screen_state (id, revision) VALUES (1, 0);
          PRAGMA user_version = 1;
        `);
        })
        .immediate();
    },
    snapshot(now = Date.now()): ScreenState {
      return db.transaction((tx) => {
        const meta = tx.select().from(state).where(eq(state.id, 1)).get();
        if (!meta) throw new Error("Database has not been initialized");
        return {
          cards: tx
            .select()
            .from(cards)
            .all()
            .map((row) => row.payload),
          revision: meta.revision,
          heartbeat: meta.heartbeat,
          serverTime: now,
        };
      });
    },
    seedDemo(input: Card[]) {
      return db.transaction(
        (tx) => {
          const meta = tx.select().from(state).where(eq(state.id, 1)).get();
          if (!meta) throw new Error("Run migrations first");
          if (meta.demoSeeded) return false;
          for (const card of input)
            tx.insert(cards)
              .values({ id: card.id, payload: card, expiresAt: card.expiresAt })
              .run();
          tx.update(state)
            .set({ demoSeeded: true, revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
          return true;
        },
        { behavior: "immediate" },
      );
    },
    tick(now = Date.now()) {
      db.transaction(
        (tx) => {
          tx.delete(cards).where(lte(cards.expiresAt, now)).run();
          tx.update(state)
            .set({ heartbeat: now, revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    stop() {
      db.update(state)
        .set({ heartbeat: null, revision: sql`${state.revision} + 1` })
        .where(eq(state.id, 1))
        .run();
    },
  };
}

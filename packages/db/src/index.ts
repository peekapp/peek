import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, lte, sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  evaluateScenario,
  validateConfig,
  definitions,
  type Scenario,
  type CalendarEvent,
} from "@peek/core/scenarios";
import type { Locale } from "@peek/core/i18n";
import type { Card } from "@peek/core";
import type { ScreenState } from "@peek/core/state";
import { cards, state, scenarios, events } from "./schema";

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
  function installDemo(input: Card[], now: number) {
    for (const kind of ["meeting", "deadline"] as const) {
      const definition = kind === "meeting" ? "meetings" : "deadlines";
      const id = `demo-${definition}`;
      const config = {
        name: definition === "meetings" ? "Meetings" : "Deadlines",
        definition,
        sourceId: id,
        enabled: true,
        filterText: "",
        ...definitions[definition].defaults,
      };
      sqlite
        .query(
          "INSERT OR IGNORE INTO scenarios (id, config, next_run_at) VALUES (?, ?, ?)",
        )
        .run(id, JSON.stringify(config), now);
    }
    for (const card of input) {
      const sourceId =
        card.kind === "meeting" ? "demo-meetings" : "demo-deadlines";
      const event: CalendarEvent = {
        id: card.id,
        sourceId,
        title: card.title,
        owner: card.owner,
        startAt: card.targetAt,
        location: card.location,
      };
      sqlite
        .query("INSERT OR IGNORE INTO events (id, payload) VALUES (?, ?)")
        .run(card.id, JSON.stringify(event));
      sqlite
        .query("UPDATE cards SET scenario_id = ? WHERE id = ?")
        .run(sourceId, card.id);
    }
  }
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
          if (version > 2)
            throw new Error("Database schema is newer than this application");
          if (version === 0)
            sqlite.exec(`
          CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
          CREATE INDEX cards_expiry ON cards(expires_at);
          CREATE TABLE screen_state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, heartbeat INTEGER, demo_seeded INTEGER NOT NULL DEFAULT 0);
          INSERT INTO screen_state (id, revision) VALUES (1, 0);
          PRAGMA user_version = 1;
        `);
          if (version < 2) {
            sqlite.exec(`
              ALTER TABLE cards ADD COLUMN scenario_id TEXT;
              ALTER TABLE screen_state ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
              CREATE TABLE scenarios (id TEXT PRIMARY KEY NOT NULL, config TEXT NOT NULL, next_run_at INTEGER, last_run_at INTEGER, last_error TEXT);
              CREATE INDEX scenarios_due ON scenarios(next_run_at);
              CREATE TABLE events (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);
              PRAGMA user_version = 2;
            `);
            const existing = db
              .select()
              .from(cards)
              .all()
              .map((row) => row.payload);
            if (existing.length) installDemo(existing, Date.now());
          }
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
          locale: meta.locale,
          scenarioErrors: tx
            .select()
            .from(scenarios)
            .all()
            .filter((row) => row.lastError).length,
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
          installDemo(input, Date.now());
          tx.update(state)
            .set({ demoSeeded: true, revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
          return true;
        },
        { behavior: "immediate" },
      );
    },
    listScenarios(): Scenario[] {
      return db
        .select()
        .from(scenarios)
        .all()
        .map((row) => ({
          ...row.config,
          id: row.id,
          nextRunAt: row.nextRunAt,
          lastRunAt: row.lastRunAt,
          lastError: row.lastError,
        }));
    },
    saveScenario(id: string, input: unknown, now = Date.now()) {
      const config = validateConfig(input);
      db.transaction(
        (tx) => {
          tx.insert(scenarios)
            .values({ id, config, nextRunAt: config.enabled ? now : null })
            .onConflictDoUpdate({
              target: scenarios.id,
              set: {
                config,
                nextRunAt: config.enabled ? now : null,
                lastError: null,
              },
            })
            .run();
          if (!config.enabled)
            tx.delete(cards).where(eq(cards.scenarioId, id)).run();
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    deleteScenario(id: string) {
      db.transaction(
        (tx) => {
          tx.delete(cards).where(eq(cards.scenarioId, id)).run();
          tx.delete(scenarios).where(eq(scenarios.id, id)).run();
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    setLocale(locale: Locale) {
      if (locale !== "en" && locale !== "ru") throw new Error("invalid");
      db.update(state)
        .set({ locale, revision: sql`${state.revision} + 1` })
        .where(eq(state.id, 1))
        .run();
    },
    replaceSource(sourceId: string, input: CalendarEvent[], now = Date.now()) {
      db.transaction(
        (tx) => {
          for (const row of tx.select().from(events).all())
            if (row.payload.sourceId === sourceId)
              tx.delete(events).where(eq(events.id, row.id)).run();
          for (const event of input) {
            if (event.sourceId !== sourceId)
              throw new Error("Source binding mismatch");
            tx.insert(events)
              .values({ id: `${sourceId}:${event.id}`, payload: event })
              .run();
          }
          for (const row of tx.select().from(scenarios).all())
            if (row.config.sourceId === sourceId && row.config.enabled)
              tx.update(scenarios)
                .set({ nextRunAt: now })
                .where(eq(scenarios.id, row.id))
                .run();
        },
        { behavior: "immediate" },
      );
    },
    runDue(now = Date.now()) {
      // One worker, synchronous handlers; an immediate transaction also prevents
      // settings edits from racing a handler and being overwritten by its result.
      const due = db
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(lte(scenarios.nextRunAt, now))
        .all();
      for (const { id } of due) {
        try {
          db.transaction(
            (tx) => {
              const row = tx
                .select()
                .from(scenarios)
                .where(eq(scenarios.id, id))
                .get();
              if (
                !row ||
                !row.config.enabled ||
                row.nextRunAt === null ||
                row.nextRunAt > now
              )
                return;
              const scenario = {
                ...row.config,
                id,
                nextRunAt: row.nextRunAt,
                lastRunAt: row.lastRunAt,
                lastError: row.lastError,
              };
              const input = tx
                .select()
                .from(events)
                .all()
                .map((e) => e.payload)
                .filter((e) => e.sourceId === scenario.sourceId);
              const result = evaluateScenario(scenario, input, now);
              tx.delete(cards).where(eq(cards.scenarioId, id)).run();
              for (const card of result.cards)
                tx.insert(cards)
                  .values({
                    id: card.id,
                    payload: card,
                    expiresAt: card.expiresAt,
                    scenarioId: id,
                  })
                  .run();
              tx.update(scenarios)
                .set({
                  nextRunAt: result.nextRunAt,
                  lastRunAt: now,
                  lastError: null,
                })
                .where(eq(scenarios.id, id))
                .run();
              tx.update(state)
                .set({ revision: sql`${state.revision} + 1` })
                .where(eq(state.id, 1))
                .run();
            },
            { behavior: "immediate" },
          );
        } catch {
          db.transaction((tx) => {
            tx.update(scenarios)
              .set({
                nextRunAt: now + 60000,
                lastRunAt: now,
                lastError: "execution-failed",
              })
              .where(eq(scenarios.id, id))
              .run();
            tx.update(state)
              .set({ revision: sql`${state.revision} + 1` })
              .where(eq(state.id, 1))
              .run();
          });
        }
      }
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

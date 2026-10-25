import { migrateExtensions } from "@peek/extensions/schema";
import { isTheme } from "@peek/core/themes";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, lte, sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Locale } from "@peek/core/i18n";
import { validateScreen, validateScreenId } from "@peek/core/screens";
import { validateProfile } from "@peek/core/profiles";
import type { Card } from "@peek/core";
import type { ScreenState } from "@peek/core/state";
import { cards, state, profiles, screens } from "./schema";

export function installationTimeZone() {
  const zone =
    process.env.PEEK_TIMEZONE ||
    process.env.TZ ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  } catch {
    throw new Error(
      "Invalid PEEK_TIMEZONE or TZ: use an IANA timezone such as Europe/Moscow",
    );
  }
  return zone;
}

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
  function ownerFor(id: unknown) {
    if (typeof id !== "string") throw new Error("invalid-profile");
    const profile = db.select().from(profiles).where(eq(profiles.id, id)).get();
    if (!profile) throw new Error("invalid-profile");
    return {
      profileId: profile.id,
      name: profile.name,
      color: profile.color,
      system: profile.system,
    };
  }
  return {
    close() {
      sqlite.close();
    },
    migrate() {
      sqlite.exec("PRAGMA journal_mode = WAL;");
      sqlite
        .transaction(() => {
          const { user_version: version } = sqlite
            .query("PRAGMA user_version")
            .get() as { user_version: number };
          if (version > 12)
            throw new Error("Database schema is newer than this application");
          if (version === 12) return;
          // MVP reset: the old built-in model and extension snapshots are intentionally discarded.
          sqlite.exec(`
          DROP TABLE IF EXISTS cards;
          DROP TABLE IF EXISTS screen_state;
          DROP TABLE IF EXISTS scenarios;
          DROP TABLE IF EXISTS events;
          DROP TABLE IF EXISTS calendars;
          DROP TABLE IF EXISTS profiles;
          DROP TABLE IF EXISTS screens;
          DROP TABLE IF EXISTS extension_packages;
          DROP TABLE IF EXISTS extension_instances;
          DROP TABLE IF EXISTS extension_operations;
          DROP TABLE IF EXISTS extension_history;
          DROP TABLE IF EXISTS extension_runtime;
          DROP TABLE IF EXISTS extension_defaults;
          DROP TABLE IF EXISTS extension_contracts;
          CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, scenario_id TEXT);
          CREATE INDEX cards_expiry ON cards(expires_at);
          CREATE TABLE screen_state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, heartbeat INTEGER, theme TEXT NOT NULL DEFAULT 'night', locale TEXT NOT NULL DEFAULT 'en', demo_seeded INTEGER NOT NULL DEFAULT 0);
          INSERT INTO screen_state (id, revision) VALUES (1, 0);
          CREATE TABLE profiles (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, system INTEGER NOT NULL);
          INSERT INTO profiles VALUES ('shared', 'Shared', 'blue', 1);
          CREATE TABLE screens (id TEXT PRIMARY KEY NOT NULL, config TEXT NOT NULL);
        `);
          sqlite.query("INSERT INTO screens VALUES (?, ?)").run(
            "default",
            JSON.stringify({
              name: "Default",
              allProfiles: true,
              profileIds: [],
              theme: "inherit",
              scale: 1,
            }),
          );
          migrateExtensions(sqlite);
          sqlite.exec("PRAGMA user_version = 12;");
        })
        .immediate();
    },
    listScreens() {
      return db
        .select()
        .from(screens)
        .all()
        .map((row) => ({ id: row.id, ...row.config }))
        .sort(
          (a, b) =>
            Number(b.id === "default") - Number(a.id === "default") ||
            a.name.localeCompare(b.name),
        );
    },
    saveScreen(id: string, input: unknown, previousId?: string | null) {
      validateScreenId(id);
      if (previousId != null) validateScreenId(previousId);
      const config = validateScreen(input);
      db.transaction(
        (tx) => {
          const existing = tx
            .select()
            .from(screens)
            .where(eq(screens.id, id))
            .get();
          if (existing && previousId !== undefined && previousId !== id)
            throw new Error("screen-id-taken");
          if (previousId != null) {
            if (
              !tx.select().from(screens).where(eq(screens.id, previousId)).get()
            )
              throw new Error("screen-not-found");
            if (previousId !== id)
              tx.delete(screens).where(eq(screens.id, previousId)).run();
          }
          for (const profileId of config.profileIds) ownerFor(profileId);
          tx.insert(screens)
            .values({ id, config })
            .onConflictDoUpdate({ target: screens.id, set: { config } })
            .run();
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    deleteScreen(id: string) {
      db.transaction(
        (tx) => {
          if (!tx.select().from(screens).where(eq(screens.id, id)).get())
            throw new Error("screen-not-found");
          tx.delete(screens).where(eq(screens.id, id)).run();
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    listProfiles() {
      return db
        .select()
        .from(profiles)
        .all()
        .sort(
          (a, b) =>
            Number(b.system) - Number(a.system) || a.name.localeCompare(b.name),
        );
    },
    saveProfile(id: string, input: unknown) {
      const config = validateProfile(input);
      if (!/^profile-[a-zA-Z0-9-]{1,80}$/.test(id))
        throw new Error("invalid-profile");
      db.transaction(
        (tx) => {
          tx.insert(profiles)
            .values({ id, ...config, system: false })
            .onConflictDoUpdate({ target: profiles.id, set: config })
            .run();
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    deleteProfile(id: string) {
      db.transaction(
        (tx) => {
          const profile = tx
            .select()
            .from(profiles)
            .where(eq(profiles.id, id))
            .get();
          if (!profile || profile.system) throw new Error("invalid-profile");
          if (
            sqlite
              .query(
                "SELECT id FROM extension_instances WHERE profile_id = ? LIMIT 1",
              )
              .get(id) ||
            tx
              .select()
              .from(screens)
              .all()
              .some((s) => s.config.profileIds.includes(id))
          )
            throw new Error("profile-in-use");
          tx.delete(profiles).where(eq(profiles.id, id)).run();
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    snapshot(now = Date.now(), screenId?: string): ScreenState {
      return db.transaction((tx) => {
        const meta = tx.select().from(state).where(eq(state.id, 1)).get();
        if (!meta) throw new Error("Database has not been initialized");
        const screenRow = screenId
          ? tx.select().from(screens).where(eq(screens.id, screenId)).get()
          : undefined;
        if (screenId && !screenRow) throw new Error("screen-not-found");
        const screen = screenRow
          ? { id: screenRow.id, ...screenRow.config }
          : undefined;
        const includesProfile = (id: string) =>
          !screen || screen.allProfiles || screen.profileIds.includes(id);
        const instances = sqlite
          .query<
            {
              id: string;
              kind: string;
              profile_id: string;
              bindings: string;
              enabled: number;
              last_error: string | null;
              last_success: number | null;
              next_run_at: number | null;
            },
            []
          >(
            "SELECT id,kind,profile_id,bindings,enabled,last_error,last_success,next_run_at FROM extension_instances",
          )
          .all();
        const selectedScenarios = instances.filter(
          (i) =>
            i.kind === "scenario" && i.enabled && includesProfile(i.profile_id),
        );
        const sourceIds = new Set(
          selectedScenarios.flatMap((i) =>
            Object.values(
              JSON.parse(i.bindings) as Record<
                string,
                { connectionId: string }[]
              >,
            )
              .flat()
              .map((b) => b.connectionId),
          ),
        );
        const scenarioProfiles = new Map(
          instances.map((i) => [i.id, i.profile_id]),
        );
        const profileOwners = new Map(
          tx
            .select()
            .from(profiles)
            .all()
            .map((p) => [
              p.id,
              {
                profileId: p.id,
                name: p.name,
                color: p.color,
                system: p.system,
              },
            ]),
        );
        return {
          screen,
          theme: meta.theme,
          timeZone: installationTimeZone(),
          cards: tx
            .select()
            .from(cards)
            .all()
            .map((row) => {
              const profileId = row.scenarioId
                ? scenarioProfiles.get(row.scenarioId)
                : undefined;
              if (profileId) {
                const owner = profileOwners.get(profileId);
                if (!owner) throw new Error("invalid-profile");
                return { ...row.payload, owner };
              }
              return row.payload;
            })
            .filter((card) =>
              includesProfile(card.owner.profileId ?? "shared"),
            ),
          revision: meta.revision,
          heartbeat: meta.heartbeat,
          serverTime: now,
          locale: meta.locale,
          connectionErrors: instances.filter(
            (i) =>
              i.kind === "connection" &&
              i.enabled &&
              (!screen || sourceIds.has(i.id)) &&
              (i.last_error ||
                i.last_success === null ||
                (i.next_run_at !== null && now > i.next_run_at + 30000)),
          ).length,
          scenarioErrors: selectedScenarios.filter((i) => i.last_error).length,
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
    setTheme(theme: unknown) {
      if (!isTheme(theme)) throw new Error("invalid");
      db.update(state)
        .set({ theme, revision: sql`${state.revision} + 1` })
        .where(eq(state.id, 1))
        .run();
    },
    setLocale(locale: Locale) {
      if (locale !== "en" && locale !== "ru") throw new Error("invalid");
      db.update(state)
        .set({ locale, revision: sql`${state.revision} + 1` })
        .where(eq(state.id, 1))
        .run();
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

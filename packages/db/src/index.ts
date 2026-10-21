import { migrateExtensions } from "@peek/extensions/schema";
import { isTheme } from "@peek/core/themes";
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
import {
  validateScreen,
  validateScreenId,
  suggestScreenId,
} from "@peek/core/screens";
import { validateProfile } from "@peek/core/profiles";
import type { Card } from "@peek/core";
import type { ScreenState } from "@peek/core/state";
import { encryptSecret, decryptSecret } from "./secrets";
import {
  validateCalendar,
  validateCalendarUrl,
  type CalendarConnection,
} from "@peek/core/calendars";
import {
  cards,
  state,
  scenarios,
  events,
  calendars,
  profiles,
  screens,
} from "./schema";

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
  function installDemo(input: Card[], now: number) {
    for (const kind of ["meeting", "deadline"] as const) {
      const definition = kind === "meeting" ? "meetings" : "deadlines";
      const id = `demo-${definition}`;
      const config = {
        name: definition === "meetings" ? "Meetings" : "Deadlines",
        definition,
        sourceIds: [id],
        profileId: "shared",
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
          if (version > 10)
            throw new Error("Database schema is newer than this application");
          migrateExtensions(sqlite);
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
          if (version < 3)
            sqlite.exec(`
            CREATE TABLE calendars (id TEXT PRIMARY KEY NOT NULL, config TEXT NOT NULL, secret TEXT NOT NULL, version INTEGER NOT NULL,
              last_success INTEGER, next_sync INTEGER NOT NULL, error TEXT, failures INTEGER NOT NULL DEFAULT 0,
              event_count INTEGER NOT NULL DEFAULT 0, etag TEXT, modified TEXT, cache TEXT);
            CREATE INDEX calendars_due ON calendars(next_sync);
            PRAGMA user_version = 3;
          `);
          if (version < 4)
            sqlite.exec(
              `ALTER TABLE calendars ADD COLUMN checked_at INTEGER; PRAGMA user_version = 4;`,
            );
          if (version < 5) {
            sqlite.exec(`CREATE TABLE profiles (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, system INTEGER NOT NULL);
              INSERT INTO profiles VALUES ('shared', 'Shared', 'blue', 1);`);
            const imported = new Map<string, string>();
            function importOwner(owner: Card["owner"]) {
              if (["Общее", "Shared"].includes(owner.name)) return "shared";
              const key = JSON.stringify([owner.name, owner.color]);
              if (imported.has(key)) return imported.get(key)!;
              const id = `profile-${crypto.randomUUID()}`;
              db.insert(profiles)
                .values({
                  id,
                  name: owner.name,
                  color: owner.color,
                  system: false,
                })
                .run();
              imported.set(key, id);
              return id;
            }
            for (const row of db.select().from(calendars).all()) {
              const profileId = importOwner(row.config.owner);
              db.update(calendars)
                .set({ config: { ...row.config, profileId } })
                .where(eq(calendars.id, row.id))
                .run();
            }
            for (const row of db.select().from(events).all())
              importOwner(row.payload.owner);
            for (const row of db.select().from(cards).all())
              importOwner(row.payload.owner);
            for (const row of db.select().from(scenarios).all()) {
              const legacy = row.config as typeof row.config & {
                sourceId?: string;
              };
              const sourceId = legacy.sourceId ?? legacy.sourceIds[0];
              const source = db
                .select()
                .from(calendars)
                .where(eq(calendars.id, sourceId))
                .get();
              const owners = [
                ...new Set(
                  db
                    .select()
                    .from(events)
                    .all()
                    .filter((e) => e.payload.sourceId === sourceId)
                    .map((e) => importOwner(e.payload.owner)),
                ),
              ];
              db.update(scenarios)
                .set({
                  config: {
                    ...row.config,
                    profileId:
                      source?.config.profileId ??
                      (owners.length === 1 ? owners[0] : "shared"),
                  },
                })
                .where(eq(scenarios.id, row.id))
                .run();
            }
            sqlite.exec("PRAGMA user_version = 5;");
          }
          if (version < 6) {
            sqlite.exec(
              `CREATE TABLE IF NOT EXISTS screens (id TEXT PRIMARY KEY NOT NULL, config TEXT NOT NULL);`,
            );
            sqlite
              .query("INSERT OR IGNORE INTO screens (id, config) VALUES (?, ?)")
              .run(
                "screen-home",
                JSON.stringify({
                  name: "Home",
                  allProfiles: true,
                  profileIds: [],
                  theme: "night",
                  scale: 1,
                  timeZone: "Europe/Moscow",
                }),
              );
            sqlite.exec("PRAGMA user_version = 6;");
          }
          if (version < 7) {
            const rows = db.select().from(screens).all();
            const used = new Set<string>(["default", "new"]);
            for (const row of rows) {
              const config = validateScreen(row.config);
              let id = "default";
              if (row.id === "screen-home") {
                if (config.name === "Home") config.name = "Default";
              } else {
                const base = suggestScreenId(config.name) || "screen";
                id = base;
                let suffix = 2;
                while (used.has(id)) id = `${base}-${suffix++}`;
                used.add(id);
              }
              // Stage new rows after removing legacy IDs, avoiding collisions.
              row.id = id;
              row.config = config;
            }
            db.delete(screens).run();
            for (const row of rows) db.insert(screens).values(row).run();
            sqlite.exec("PRAGMA user_version = 7;");
          }
          if (version < 8) {
            sqlite.exec(`ALTER TABLE screen_state ADD COLUMN theme TEXT NOT NULL DEFAULT 'night';
              PRAGMA user_version = 8;`);
            // The former default follows the app; explicit light screens stay light.
            for (const row of db.select().from(screens).all()) {
              if (row.config.theme === "night")
                db.update(screens)
                  .set({ config: { ...row.config, theme: "inherit" } })
                  .where(eq(screens.id, row.id))
                  .run();
            }
          }
          if (version < 9) {
            for (const row of db.select().from(scenarios).all()) {
              const { sourceId, ...rest } = row.config as typeof row.config & {
                sourceId?: string;
              };
              const config = {
                ...rest,
                sourceIds: rest.sourceIds ?? (sourceId ? [sourceId] : []),
              };
              db.update(scenarios)
                .set({ config })
                .where(eq(scenarios.id, row.id))
                .run();
            }
            sqlite.exec("PRAGMA user_version = 9;");
          }
          sqlite.exec("PRAGMA user_version = 10;");
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
              .from(calendars)
              .all()
              .some((c) => c.config.profileId === id) ||
            tx
              .select()
              .from(scenarios)
              .all()
              .some((s) => s.config.profileId === id) ||
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
        const selectedScenarios = tx
          .select()
          .from(scenarios)
          .all()
          .filter((s) => includesProfile(s.config.profileId ?? "shared"));
        const sourceIds = new Set(
          selectedScenarios.flatMap((s) => s.config.sourceIds),
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
              const scenario = row.scenarioId
                ? tx
                    .select()
                    .from(scenarios)
                    .where(eq(scenarios.id, row.scenarioId))
                    .get()
                : undefined;
              const extension = row.scenarioId
                ? (sqlite
                    .query(
                      "SELECT profile_id FROM extension_instances WHERE id=?",
                    )
                    .get(row.scenarioId) as { profile_id: string } | null)
                : null;
              if (extension)
                return {
                  ...row.payload,
                  owner: ownerFor(extension.profile_id),
                };
              return scenario?.config.profileId
                ? { ...row.payload, owner: ownerFor(scenario.config.profileId) }
                : row.payload;
            })
            .filter((card) =>
              includesProfile(card.owner.profileId ?? "shared"),
            ),
          revision: meta.revision,
          heartbeat: meta.heartbeat,
          serverTime: now,
          locale: meta.locale,
          calendarErrors: tx
            .select()
            .from(calendars)
            .all()
            .filter(
              (c) =>
                (!screen || sourceIds.has(c.id)) &&
                (c.error ||
                  c.lastSuccess === null ||
                  now - c.lastSuccess >
                    c.config.intervalSeconds * 2000 + 30000),
            ).length,
          scenarioErrors: tx
            .select()
            .from(scenarios)
            .all()
            .filter(
              (row) =>
                row.lastError &&
                includesProfile(row.config.profileId ?? "shared"),
            ).length,
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
    listCalendars(): CalendarConnection[] {
      return db
        .select()
        .from(calendars)
        .all()
        .map((c) => ({
          ...c.config,
          owner: ownerFor(c.config.profileId ?? "shared"),
          id: c.id,
          version: c.version,
          lastSuccess: c.lastSuccess,
          checkedAt: c.checkedAt,
          nextSync: c.nextSync,
          error: c.error,
          failures: c.failures,
          eventCount: c.eventCount,
        }));
    },
    saveCalendar(id: string, input: unknown, url?: unknown, now = Date.now()) {
      const value = input as { profileId?: unknown; owner?: unknown };
      const profileId = value?.profileId ?? "shared";
      const owner = ownerFor(profileId);
      const config = validateCalendar({ ...value, profileId, owner });
      const existing = db
        .select()
        .from(calendars)
        .where(eq(calendars.id, id))
        .get();
      // Refuse a replacement key when existing secrets can no longer be read.
      const firstSecret = db
        .select({ secret: calendars.secret })
        .from(calendars)
        .get();
      if (firstSecret) decryptSecret(firstSecret.secret, path);
      const secret = url
        ? encryptSecret(validateCalendarUrl(url), path)
        : existing?.secret;
      if (!secret) throw new Error("invalid-url");
      db.transaction(
        (tx) => {
          ownerFor(config.profileId);
          tx.insert(calendars)
            .values({
              id,
              config,
              secret,
              version: 1,
              nextSync: now,
              failures: 0,
              eventCount: 0,
            })
            .onConflictDoUpdate({
              target: calendars.id,
              set: {
                config,
                secret,
                version: sql`${calendars.version} + 1`,
                nextSync: now,
                error: null,
                failures: 0,
                etag: null,
                modified: null,
                cache: null,
              },
            })
            .run();
          // An edited URL or owner must not keep displaying a previous source's data.
          if (existing) {
            for (const row of tx.select().from(events).all())
              if (row.payload.sourceId === id)
                tx.delete(events).where(eq(events.id, row.id)).run();
            for (const row of tx.select().from(scenarios).all())
              if (row.config.sourceIds.includes(id)) {
                for (const card of tx
                  .select()
                  .from(cards)
                  .where(eq(cards.scenarioId, row.id))
                  .all()) {
                  if (!card.payload.sourceId || card.payload.sourceId === id)
                    tx.delete(cards).where(eq(cards.id, card.id)).run();
                }
                tx.update(scenarios)
                  .set({ nextRunAt: row.config.enabled ? now : null })
                  .where(eq(scenarios.id, row.id))
                  .run();
              }
            tx.update(calendars)
              .set({ lastSuccess: null, eventCount: 0 })
              .where(eq(calendars.id, id))
              .run();
          }
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    deleteCalendar(id: string) {
      const references = sqlite
        .query("SELECT bindings FROM extension_instances WHERE kind='scenario'")
        .all() as { bindings: string }[];
      if (
        references.some((r) =>
          Object.values(
            JSON.parse(r.bindings) as Record<
              string,
              { connectionId: string }[]
            >,
          )
            .flat()
            .some((b) => b.connectionId === id),
        )
      )
        throw new Error("calendar-in-use");
      db.transaction(
        (tx) => {
          if (
            tx
              .select()
              .from(scenarios)
              .all()
              .some((s) => s.config.sourceIds.includes(id))
          )
            throw new Error("calendar-in-use");
          for (const row of tx.select().from(events).all())
            if (row.payload.sourceId === id)
              tx.delete(events).where(eq(events.id, row.id)).run();
          tx.delete(calendars).where(eq(calendars.id, id)).run();
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
        },
        { behavior: "immediate" },
      );
    },
    requestSync(id: string, now = Date.now()) {
      db.update(calendars)
        .set({ nextSync: now })
        .where(eq(calendars.id, id))
        .run();
    },
    dueCalendars(now = Date.now()) {
      return db
        .select()
        .from(calendars)
        .where(lte(calendars.nextSync, now))
        .all()
        .map((row) => ({
          ...row,
          config: {
            ...row.config,
            timeZone: installationTimeZone(),
            owner: ownerFor(row.config.profileId ?? "shared"),
          },
        }));
    },
    calendarUrl(secret: string) {
      return decryptSecret(secret, path);
    },
    completeSync(
      id: string,
      version: number,
      result: {
        events?: CalendarEvent[];
        etag?: string;
        modified?: string;
        error?: string;
        cache?: string;
      },
      now = Date.now(),
    ) {
      return db.transaction(
        (tx) => {
          const current = tx
            .select()
            .from(calendars)
            .where(eq(calendars.id, id))
            .get();
          if (!current || current.version !== version) return false;
          if (result.error) {
            const failures = current.failures + 1;
            tx.update(calendars)
              .set({
                error: result.error,
                checkedAt: now,
                failures,
                nextSync:
                  now +
                  Math.min(900, 60 * 2 ** Math.min(failures - 1, 4)) * 1000,
              })
              .where(eq(calendars.id, id))
              .run();
          } else {
            if (result.events) {
              for (const row of tx.select().from(events).all())
                if (row.payload.sourceId === id)
                  tx.delete(events).where(eq(events.id, row.id)).run();
              for (const event of result.events) {
                if (event.sourceId !== id)
                  throw new Error("Source binding mismatch");
                tx.insert(events)
                  .values({ id: `${id}:${event.id}`, payload: event })
                  .run();
              }
              for (const row of tx.select().from(scenarios).all())
                if (row.config.sourceIds.includes(id) && row.config.enabled)
                  tx.update(scenarios)
                    .set({ nextRunAt: now })
                    .where(eq(scenarios.id, row.id))
                    .run();
            }
            tx.update(calendars)
              .set({
                lastSuccess: now,
                checkedAt: now,
                nextSync: now + current.config.intervalSeconds * 1000,
                failures: 0,
                error: null,
                cache:
                  result.cache === undefined
                    ? current.cache
                    : encryptSecret(result.cache, path),
                eventCount: result.events?.length ?? current.eventCount,
                etag: result.etag ?? null,
                modified: result.modified ?? null,
              })
              .where(eq(calendars.id, id))
              .run();
          }
          tx.update(state)
            .set({ revision: sql`${state.revision} + 1` })
            .where(eq(state.id, 1))
            .run();
          sqlite.run(
            "UPDATE extension_instances SET next_run_at=?,generation=generation+1 WHERE kind='scenario' AND enabled=1",
            [Date.now()],
          );
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
      config.profileId ??= "shared";
      ownerFor(config.profileId);
      db.transaction(
        (tx) => {
          ownerFor(config.profileId);
          for (const sourceId of config.sourceIds) {
            if (
              !["demo-meetings", "demo-deadlines"].includes(sourceId) &&
              !tx
                .select()
                .from(calendars)
                .where(eq(calendars.id, sourceId))
                .get()
            )
              throw new Error("invalid");
          }
          // Remove detached sources immediately, even if the worker is offline.
          for (const card of tx
            .select()
            .from(cards)
            .where(eq(cards.scenarioId, id))
            .all()) {
            if (
              !card.payload.sourceId ||
              !config.sourceIds.includes(card.payload.sourceId)
            )
              tx.delete(cards).where(eq(cards.id, card.id)).run();
          }
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
            if (row.config.sourceIds.includes(sourceId) && row.config.enabled)
              tx.update(scenarios)
                .set({ nextRunAt: now })
                .where(eq(scenarios.id, row.id))
                .run();
        },
        { behavior: "immediate" },
      );
    },
    runDue(now = Date.now()) {
      const due = db
        .select()
        .from(scenarios)
        .where(lte(scenarios.nextRunAt, now))
        .all();
      for (const row of due) {
        if (!row.config.enabled || row.nextRunAt === null) continue;
        try {
          const scenario = {
            ...row.config,
            id: row.id,
            nextRunAt: row.nextRunAt,
            lastRunAt: row.lastRunAt,
            lastError: row.lastError,
          };
          const input = db
            .select()
            .from(events)
            .all()
            .map((e) => e.payload)
            .filter((e) => scenario.sourceIds.includes(e.sourceId));
          // SDK evaluation does not hold a SQLite write lock.
          const result = evaluateScenario(scenario, input, now);
          db.transaction(
            (tx) => {
              const current = tx
                .select()
                .from(scenarios)
                .where(eq(scenarios.id, row.id))
                .get();
              if (!current || JSON.stringify(current) !== JSON.stringify(row))
                return;
              tx.delete(cards).where(eq(cards.scenarioId, row.id)).run();
              for (const card of result.cards)
                tx.insert(cards)
                  .values({
                    id: card.id,
                    payload: {
                      ...card,
                      owner: ownerFor(row.config.profileId ?? "shared"),
                    },
                    expiresAt: card.expiresAt,
                    scenarioId: row.id,
                  })
                  .run();
              tx.update(scenarios)
                .set({
                  nextRunAt: result.nextRunAt,
                  lastRunAt: now,
                  lastError: null,
                })
                .where(eq(scenarios.id, row.id))
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
              .where(eq(scenarios.id, row.id))
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

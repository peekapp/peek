import { it } from "node:test";
import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../packages/db/src";
import {
  evaluateScenario,
  validateConfig,
  type ScenarioConfig,
} from "../packages/core/src/scenarios";
import { createDemoCards } from "../packages/core/src/demo";
const config: ScenarioConfig = {
  name: "Встречи",
  definition: "meetings",
  sourceIds: ["demo-meetings"],
  enabled: true,
  leadMinutes: 10,
  urgentMinutes: 1,
  retainMinutes: 5,
  filterText: "",
};
const now = 1_000_000;
const event = {
  id: "one",
  sourceId: "demo-meetings",
  title: "Обсуждение",
  owner: { name: "Тим", color: "blue" as const },
  startAt: now + 20 * 60000,
};
it("validates all settings and isolates selected sources and title filters", () => {
  assert.throws(() => validateConfig({ ...config, leadMinutes: 1 }));
  assert.throws(() => validateConfig({ ...config, retainMinutes: 1441 }));
  assert.throws(() => validateConfig({ ...config, enabled: "yes" }));
  const scenario = {
    ...config,
    id: "a",
    nextRunAt: now,
    lastRunAt: null,
    lastError: null,
    filterText: "ОБСУЖ",
  };
  const output = evaluateScenario(
    scenario,
    [event, { ...event, id: "other", sourceId: "demo-deadlines" }],
    event.startAt,
  );
  assert.equal(output.cards.length, 1);
  assert.equal(output.cards[0].id, "a:demo-meetings:one");
  const earlyEnd = evaluateScenario(
    scenario,
    [{ ...event, endAt: event.startAt + 1000 }],
    event.startAt,
  );
  assert.equal(earlyEnd.cards[0].expiresAt, event.startAt + 1000);
});
it("schedules appearance, priority, start and expiration without duplicate cards", () => {
  const store = openStore(":memory:");
  try {
    store.migrate();
    store.saveScenario("a", config, now);
    store.replaceSource(event.sourceId, [event], now);
    store.runDue(now);
    assert.equal(store.snapshot().cards.length, 0);
    assert.equal(store.listScenarios()[0].nextRunAt, event.startAt - 600000);
    store.runDue(event.startAt - 600000);
    assert.equal(store.snapshot().cards.length, 1);
    assert.equal(store.listScenarios()[0].nextRunAt, event.startAt - 60000);
    store.runDue(event.startAt - 60000);
    store.runDue(event.startAt - 60000);
    assert.equal(store.snapshot().cards.length, 1);
    assert.equal(store.listScenarios()[0].nextRunAt, event.startAt);
    store.runDue(event.startAt);
    assert.equal(store.listScenarios()[0].nextRunAt, event.startAt + 300000);
    store.runDue(event.startAt + 300000);
    assert.equal(store.snapshot().cards.length, 0);
    assert.equal(store.listScenarios()[0].nextRunAt, null);
  } finally {
    store.close();
  }
});
it("updates and cancels source events, and disables/deletes only owned cards", () => {
  const store = openStore(":memory:");
  try {
    store.migrate();
    store.replaceSource(event.sourceId, [event], event.startAt);
    for (const id of ["a", "b"]) store.saveScenario(id, config, event.startAt);
    store.runDue(event.startAt);
    assert.equal(store.snapshot().cards.length, 2);
    store.saveScenario("a", { ...config, enabled: false }, event.startAt);
    assert.equal(store.snapshot().cards.length, 1);
    store.replaceSource(
      event.sourceId,
      [{ ...event, title: "Новое название" }],
      event.startAt + 1,
    );
    store.runDue(event.startAt + 1);
    assert.equal(store.snapshot().cards[0].title, "Новое название");
    store.replaceSource(event.sourceId, [], event.startAt + 2);
    store.runDue(event.startAt + 2);
    assert.equal(store.snapshot().cards.length, 0);
    store.deleteScenario("a");
    assert.equal(store.listScenarios().length, 1);
    store.setLocale("ru");
    assert.equal(store.snapshot().locale, "ru");
    assert.throws(() => store.setLocale("de" as "ru"));
  } finally {
    store.close();
  }
});
it("migrates v1 data without resetting times and resumes persisted schedules after restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-v1-"));
  const path = join(dir, "db.sqlite");
  const old = new Database(path);
  const input = createDemoCards(Date.now());
  old.exec(`CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE screen_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, heartbeat INTEGER, demo_seeded INTEGER NOT NULL);
    INSERT INTO screen_state VALUES (1, 7, NULL, 1); PRAGMA user_version = 1;`);
  for (const c of input)
    old
      .query("INSERT INTO cards VALUES (?, ?, ?)")
      .run(c.id, JSON.stringify(c), c.expiresAt);
  old.close();
  let store = openStore(path);
  try {
    store.migrate();
    store.migrate();
    assert.equal(store.listScenarios().length, 2);
    assert.deepEqual(
      store.snapshot().cards.map(({ owner, ...card }) => card),
      input.map(({ owner, ...card }) => card),
    );
    assert.equal(store.snapshot().cards[0].owner.name, input[0].owner.name);
    assert.equal(store.listProfiles().filter((p) => p.system).length, 1);
    store.runDue(Date.now());
    const schedules = store.listScenarios();
    store.close();
    store = openStore(path);
    assert.deepEqual(store.listScenarios(), schedules);
    assert.equal(store.snapshot().cards[0].targetAt, input[0].targetAt);
    store.runDue(input[0].expiresAt);
    assert.ok(store.snapshot().cards.every((c) => c.kind !== "meeting"));
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});
it("isolates handler failures and persists a retry while other scenarios run", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-error-"));
  const path = join(dir, "db.sqlite");
  const store = openStore(path);
  try {
    store.migrate();
    store.replaceSource(event.sourceId, [event], event.startAt);
    store.saveScenario("a", config, event.startAt);
    store.saveScenario("b", config, event.startAt);
    const raw = new Database(path);
    raw
      .query("UPDATE scenarios SET config = ? WHERE id = ?")
      .run(JSON.stringify({ ...config, definition: "missing" }), "a");
    raw.close();
    store.runDue(event.startAt);
    assert.equal(store.snapshot().cards.length, 1);
    assert.equal(store.snapshot().scenarioErrors, 1);
    const failed = store.listScenarios().find((s) => s.id === "a")!;
    assert.equal(failed.nextRunAt, event.startAt + 60000);
    assert.equal(failed.lastError, "execution-failed");
    store.saveScenario("a", config, event.startAt + 1);
    store.runDue(event.startAt + 1);
    assert.equal(store.snapshot().scenarioErrors, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});

it("validates plural bindings and normalizes legacy clients", () => {
  for (const sourceIds of [
    [],
    null,
    "demo-meetings",
    ["bad/source"],
    [1],
    Array(101).fill("demo-meetings"),
  ])
    assert.throws(() => validateConfig({ ...config, sourceIds }));
  assert.deepEqual(
    validateConfig({ ...config, sourceIds: ["demo-meetings", "demo-meetings"] })
      .sourceIds,
    ["demo-meetings"],
  );
  const { sourceIds, ...legacy } = config;
  assert.deepEqual(
    validateConfig({ ...legacy, sourceId: "demo-meetings" }),
    validateConfig(config),
  );
});

it("keeps identical event IDs distinct across sources and removes only detached cards", () => {
  const store = openStore(":memory:");
  try {
    store.migrate();
    const second = {
      ...event,
      sourceId: "demo-deadlines",
      title: "Second calendar",
    };
    store.replaceSource(event.sourceId, [event], event.startAt);
    store.replaceSource(second.sourceId, [second], event.startAt);
    for (const definition of ["meetings", "deadlines"] as const)
      store.saveScenario(
        definition,
        { ...config, definition, sourceIds: [event.sourceId, second.sourceId] },
        event.startAt,
      );
    store.runDue(event.startAt);
    store.runDue(event.startAt);
    assert.equal(store.snapshot().cards.length, 4);
    assert.equal(new Set(store.snapshot().cards.map((c) => c.id)).size, 4);
    store.saveScenario("meetings", config, event.startAt + 1);
    assert.equal(store.snapshot().cards.length, 3);
    store.runDue(event.startAt + 1);
    assert.equal(store.snapshot().cards.length, 3);
    store.replaceSource(second.sourceId, [], event.startAt + 2);
    store.runDue(event.startAt + 2);
    assert.equal(store.snapshot().cards.length, 2);
    assert.ok(
      store.snapshot().cards.every((c) => c.sourceId === event.sourceId),
    );
    assert.throws(() =>
      store.saveScenario("meetings", {
        ...config,
        sourceIds: [event.sourceId, "cal-missing"],
      }),
    );
    assert.deepEqual(
      store.listScenarios().find((s) => s.id === "meetings")!.sourceIds,
      config.sourceIds,
    );
  } finally {
    store.close();
  }
});

it("migrates v8 source bindings once while preserving schedules, status, and cards", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-bindings-"));
  const path = join(dir, "db.sqlite");
  let store = openStore(path);
  try {
    store.migrate();
    store.saveScenario("a", config, event.startAt);
    store.replaceSource(event.sourceId, [event], event.startAt);
    store.runDue(event.startAt);
    const before = store.listScenarios()[0];
    const cardsBefore = store.snapshot().cards;
    store.close();
    const raw = new Database(path);
    const { sourceIds, ...oldConfig } = config;
    raw
      .query("UPDATE scenarios SET config = ? WHERE id = 'a'")
      .run(
        JSON.stringify({
          ...oldConfig,
          profileId: "shared",
          sourceId: sourceIds[0],
        }),
      );
    raw.exec("PRAGMA user_version = 8");
    raw.close();
    store = openStore(path);
    store.migrate();
    store.migrate();
    assert.deepEqual(store.listScenarios()[0], before);
    assert.deepEqual(store.snapshot().cards, cardsBefore);
    store.close();
    store = openStore(path);
    assert.deepEqual(store.listScenarios()[0].sourceIds, [event.sourceId]);
    store.runDue(event.startAt + 300000);
    assert.equal(store.snapshot().cards.length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});

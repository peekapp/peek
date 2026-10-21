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
  sourceId: "demo-meetings",
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
  assert.equal(output.cards[0].id, "a:one");
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

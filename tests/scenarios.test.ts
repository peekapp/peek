import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { openStore } from "../packages/db/src";
import {
  officialStore,
  connection,
  scenario,
  publish,
  evaluate,
  packages,
  settings,
} from "./helpers/official";
import meeting from "../extensions/official/meetings";
import deadline from "../extensions/official/deadlines";
import { validate } from "../packages/extensions/src/validation";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "peek-official-")),
    path = join(dir, "db.sqlite");
  const main = openStore(path);
  main.migrate();
  const store = officialStore(path);
  return {
    dir,
    path,
    main,
    store,
    close() {
      store.close();
      main.close();
      rmSync(dir, { recursive: true });
    },
  };
}
test("official manifests validate settings and share a versioned calendar contract", () => {
  expect(packages).toHaveLength(3);
  for (const p of packages) {
    const defaults = Object.fromEntries(
      Object.entries(p.manifest.settings.properties!).map(([k, v]) => [
        k,
        v.default,
      ]),
    );
    expect(() => validate(p.manifest.settings, defaults)).not.toThrow();
    expect(() =>
      validate(p.manifest.settings, { ...defaults, extra: true }),
    ).toThrow();
  }
  const m = packages.find((p) => p.manifest.id === "peek/meetings")!.manifest;
  expect(() =>
    validate(m.settings, { ...settings, retainMinutes: 1441 }),
  ).toThrow();
  expect(m.inputs!.events.contract).toBe("peek/events");
});
test("SDK scenarios schedule visibility, urgency, start and expiry; filter titles and all-day events", () => {
  const now = 1_000_000,
    startAt = now + 20 * 60000;
  const context = {
    settings,
    state: null,
    now,
    inputs: {
      events: [
        {
          connectionId: "a",
          contract: "peek/events",
          version: "1.0.0",
          updatedAt: now,
          data: {
            from: 0,
            to: startAt + 86400000,
            events: [
              { kind: "timed", id: "event", title: "Обсуждение", startAt },
            ],
          },
        },
      ],
    },
  };
  expect(meeting.evaluate(context)).toMatchObject({
    cards: [],
    nextRunAt: startAt - 600000,
  });
  for (const [at, next] of [
    [startAt - 600000, startAt - 60000],
    [startAt - 60000, startAt],
    [startAt, startAt + 300000],
  ]) {
    const r = meeting.evaluate({ ...context, now: at });
    expect(r.cards).toHaveLength(1);
    expect(r.nextRunAt).toBe(next);
  }
  expect(meeting.evaluate({ ...context, now: startAt + 300000 })).toEqual({
    cards: [],
    nextRunAt: null,
  });
  expect(
    meeting.evaluate({
      ...context,
      now: startAt,
      settings: { ...settings, filterText: "ОБСУЖ" },
    }).cards,
  ).toHaveLength(1);
  expect(
    meeting.evaluate({
      ...context,
      now: startAt,
      settings: { ...settings, filterText: "other" },
    }).cards,
  ).toHaveLength(0);
  expect(() =>
    meeting.evaluate({ ...context, settings: { ...settings, leadMinutes: 1 } }),
  ).toThrow();
  const allDay = {
    ...context,
    now: startAt,
    inputs: {
      events: [
        {
          ...context.inputs.events[0],
          data: {
            from: 0,
            to: 86400000,
            events: [
              {
                id: "all",
                title: "Day",
                kind: "all-day",
                startDate: "1970-01-01",
                timeZone: "UTC",
              },
            ],
          },
        },
      ],
    },
  };
  expect(meeting.evaluate(allDay).cards).toHaveLength(0);
  expect(
    deadline.evaluate({ ...allDay, now: 86400000 - 1000 }).cards[0].targetAt,
  ).toBe(86400000 - 1);
  const early = {
    ...context,
    now: startAt,
    inputs: {
      events: [
        {
          ...context.inputs.events[0],
          data: {
            from: 0,
            to: 86400000,
            events: [
              {
                kind: "timed",
                id: "early",
                title: "Early",
                startAt,
                endAt: startAt + 1000,
              },
            ],
          },
        },
      ],
    },
  };
  expect(meeting.evaluate(early).cards[0].expiresAt).toBe(startAt + 1000);
});
test("common store binds multiple calendars, rejects stale results, retains data on failure and removes missing events", () => {
  const f = fixture();
  const { store, main } = f;
  try {
    const a = connection(store),
      b = connection(store),
      now = Date.now();
    for (const c of [a, b])
      publish(store, c, [
        { id: "x".repeat(2048), title: c, startAt: now + 30000 },
      ]);
    const m = scenario(store, [a, b]),
      d = scenario(store, [a, b], "shared", "deadlines");
    evaluate(store, m, now);
    evaluate(store, d, now);
    expect(main.snapshot().cards).toHaveLength(4);
    expect(new Set(main.snapshot().cards.map((c) => c.id)).size).toBe(4);
    const old = store.instance(a)!;
    store.retry(old, "execution-failed");
    expect(main.snapshot().cards).toHaveLength(4);
    expect(main.snapshot(now, "default").connectionErrors).toBe(1);
    store.requestRun(a);
    expect(store.publish(old, { datasets: { events: [] } })).toBe(false);
    publish(store, a, []);
    evaluate(store, m);
    evaluate(store, d);
    expect(main.snapshot().cards).toHaveLength(2);
    expect(() => store.removeInstance(b)).toThrow("connection-in-use");
    store.save({
      id: m,
      packageId: "peek/meetings",
      name: "Disabled",
      profileId: "shared",
      settings,
      bindings: { events: [{ connectionId: b, dataset: "events" }] },
      enabled: false,
    });
    expect(main.snapshot().cards).toHaveLength(1);
    store.removeInstance(d);
    store.removeInstance(m);
    store.removeInstance(a);
    store.removeInstance(b);
    expect(main.snapshot().cards).toHaveLength(0);
  } finally {
    f.close();
  }
});
test("bundled defaults install once, survive restart and do not claim uploaded replacements are official", () => {
  const f = fixture();
  try {
    expect(f.store.status().packages.every((p) => p.official)).toBe(true);
    f.store.provision(packages);
    expect(f.store.pending()).toBeNull();
    f.store.removePackage("peek/deadlines");
    f.store.provision(packages);
    expect(f.store.installed()).toHaveLength(2);
    const p = structuredClone(
      packages.find((p) => p.manifest.id === "peek/meetings")!,
    );
    p.manifest.version = "0.2.1";
    const preview = f.store.stage([p], [p.manifest.id]);
    f.store.confirm(preview.id);
    const op = f.store.pending()!;
    f.store.commitInstall(op, [], {});
    expect(
      f.store.status().packages.find((x) => x.manifest.id === p.manifest.id)!
        .official,
    ).toBe(false);
    f.store.rollback();
    expect(f.store.status().packages.every((p) => p.official)).toBe(true);
  } finally {
    f.close();
  }
});
test("development schema reset discards old records and creates only the shared model, once", () => {
  const f = fixture();
  try {
    const c = connection(f.store);
    scenario(f.store, [c]);
    const raw = new Database(f.path);
    raw.exec(
      "CREATE TABLE calendars(id TEXT); CREATE TABLE scenarios(id TEXT); CREATE TABLE events(id TEXT); PRAGMA user_version=11;",
    );
    raw.close();
    f.main.migrate();
    f.main.migrate();
    expect(f.store.instances()).toHaveLength(0);
    const inspect = new Database(f.path);
    expect(
      inspect
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('calendars','scenarios','events')",
        )
        .all(),
    ).toEqual([]);
    inspect.close();
    f.store.provision(packages);
    expect(f.store.pending()).not.toBeNull();
  } finally {
    f.close();
  }
});
test("credentials stay encrypted and a missing key is never silently replaced", () => {
  const f = fixture();
  try {
    connection(f.store);
    expect(JSON.stringify(f.store.status())).not.toContain("secret.ics");
    expect(readFileSync(f.path).includes(Buffer.from("secret.ics"))).toBe(
      false,
    );
    if (!process.env.PEEK_ENCRYPTION_KEY) {
      const key = join(f.dir, "secret.key");
      rmSync(key);
      expect(() => connection(f.store)).toThrow("encryption-key");
      expect(existsSync(key)).toBe(false);
    }
  } finally {
    f.close();
  }
});

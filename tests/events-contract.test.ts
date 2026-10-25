import { expect, test } from "bun:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eventsContract, type Events } from "@peekapp/sdk/contracts/events";
import { validate, manifest } from "../packages/extensions/src/validation";
import { openStore } from "../packages/db/src";
import { openExtensions } from "../packages/extensions/src/store";
import { parseCalendar } from "../extensions/official/ical/parse";
import birthday from "../extensions/examples/events-connection";
import cards from "../extensions/examples/events-scenario";
import deadline from "../extensions/official/deadlines";
import { settings } from "./helpers/official";

const loadManifest = (path: string) =>
  manifest(JSON.parse(readFileSync(path, "utf8")));
test("public Events schema rejects ambiguous dates, invalid zones, mixed occurrences and conflicting definitions", () => {
  const data: Events = {
    from: 0,
    to: 86400000,
    events: [
      { id: "a", title: "Timed", kind: "timed", startAt: 10, endAt: 20 },
      {
        id: "b",
        title: "Birthday",
        kind: "all-day",
        startDate: "2026-10-25",
        timeZone: "Europe/Moscow",
      },
    ],
  };
  expect(() => validate(eventsContract.schema, data)).not.toThrow();
  for (const event of [
    { ...data.events[1], startDate: "2026-02-30" },
    { ...data.events[1], startDate: "2026-10-25T00:00:00Z" },
    { ...data.events[1], timeZone: "Not/AZone" },
    { ...data.events[1], timeZone: "+03:00" },
    { ...data.events[1], startAt: 0 },
    { ...data.events[0], startAt: 1.5 },
    { id: "a", title: "Ambiguous", startAt: 0, allDay: true },
  ])
    expect(() =>
      validate(eventsContract.schema, { ...data, events: [event] }),
    ).toThrow();
  const m = loadManifest("extensions/examples/events-connection/peek.json");
  expect(m.provides!.events).toEqual(eventsContract);
  m.provides!.events.schema = { type: "array" };
  expect(() => manifest(m)).toThrow("contract-definition-conflict");
  for (const name of ["ical", "meetings", "deadlines"]) {
    const m = loadManifest(`extensions/official/${name}/peek.json`);
    expect(m.provides?.events ?? m.contracts![0]).toEqual(eventsContract);
  }
});

test("all-day deadline uses the next calendar date across DST and UTC boundaries", () => {
  for (const [date, zone, end] of [
    ["2026-03-29", "Europe/Berlin", Date.UTC(2026, 2, 29, 22)],
    ["2026-10-25", "Europe/Berlin", Date.UTC(2026, 9, 25, 23)],
    ["2026-10-25", "Europe/Moscow", Date.UTC(2026, 9, 25, 21)],
  ] as const) {
    const result = deadline.evaluate({
      settings,
      state: null,
      now: end - 1000,
      inputs: {
        events: [
          {
            connectionId: "birthdays",
            contract: eventsContract.id,
            version: "1.0.0",
            updatedAt: end - 1000,
            data: {
              from: end - 2 * 86400000,
              to: end + 86400000,
              events: [
                {
                  kind: "all-day",
                  id: "birthday",
                  title: "Birthday",
                  startDate: date,
                  timeZone: zone,
                },
              ],
            },
          },
        ],
      },
    });
    expect(result.cards[0].targetAt).toBe(end - 1);
  }
});

test("iCal advertises its expansion window, including recurring occurrences and replacements", () => {
  const now = Date.UTC(2026, 9, 25),
    body = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:daily
DTSTART:20261001T100000Z
DURATION:PT1H
RRULE:FREQ=DAILY
SUMMARY:Daily
END:VEVENT
END:VCALENDAR`;
  const snapshot = parseCalendar(body, { timeZone: "UTC" }, now);
  expect(snapshot.from).toBe(now - 2 * 86400000);
  expect(snapshot.to).toBe(now + 90 * 86400000);
  expect(snapshot.events).toHaveLength(92);
  expect(() => validate(eventsContract.schema, snapshot)).not.toThrow();
  const removed = parseCalendar(
    "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR",
    { timeZone: "UTC" },
    now,
  );
  expect(removed.events).toEqual([]);
});

test("independent Events providers feed a new scenario with no package-specific references", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-events-")),
    path = join(dir, "db.sqlite");
  const db = openStore(path);
  db.migrate();
  const store = openExtensions(path);
  try {
    const a = loadManifest("extensions/examples/events-connection/peek.json");
    const b = structuredClone(a);
    b.id = "another/events";
    const consumer = loadManifest(
      "extensions/examples/events-scenario/peek.json",
    );
    const review = store.stage(
      [a, b, consumer].map((manifest) => ({
        manifest,
        files: { "index.mjs": "export default {}" },
      })),
      [consumer.id],
    );
    store.confirm(review.id);
    store.commitInstall(store.pending()!, [], {});
    const save = (packageId: string, bindings = {}) =>
      store.save({
        packageId,
        name: packageId,
        settings: {},
        profileId: "shared",
        enabled: true,
        bindings,
      });
    const ids = [save(a.id), save(b.id)],
      now = Date.now();
    const first = birthday.run({
      settings: {},
      secrets: {},
      state: null,
      now,
      signal: new AbortController().signal,
      publish: async () => {},
    });
    store.publish(store.instance(ids[0])!, first);
    store.publish(store.instance(ids[1])!, {
      datasets: {
        events: {
          from: now,
          to: now + 86400000,
          events: [
            {
              kind: "timed",
              id: first.datasets.events.events[0].id,
              title: "Independently normalized",
              startAt: now + 10000,
            },
          ],
        },
      },
    });
    const id = save(consumer.id, {
      events: ids.map((connectionId) => ({ connectionId, dataset: "events" })),
    });
    const evaluate = () => {
      const i = store.instance(id)!;
      store.publish(i, cards.evaluate(store.context(i)));
    };
    evaluate();
    expect(db.snapshot().cards).toHaveLength(2);
    expect(new Set(db.snapshot().cards.map((c) => c.id)).size).toBe(2);
    store.publish(store.instance(ids[0])!, {
      datasets: { events: { from: now, to: now + 86400000, events: [] } },
    });
    evaluate();
    expect(db.snapshot().cards).toHaveLength(1);
    expect(consumer.dependencies).toBeUndefined();
  } finally {
    store.close();
    db.close();
    rmSync(dir, { recursive: true });
  }
});

test("iCal preserves point occurrences without inventing a zero-length end", () => {
  const now = Date.UTC(2026, 9, 25);
  const result = parseCalendar(
    `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:point
DTSTART:20261025T100000Z
SUMMARY:Point
END:VEVENT
END:VCALENDAR`,
    { timeZone: "UTC" },
    now,
  );
  expect(result.events[0]).toMatchObject({
    kind: "timed",
    startAt: now + 10 * 3600000,
  });
  expect(result.events[0]).not.toHaveProperty("endAt");
});

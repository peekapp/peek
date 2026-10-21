import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openStore } from "../packages/db/src";
import { parseCalendar } from "../packages/ical/src/parse";
import { syncCalendar } from "../packages/ical/src/sync";
import {
  fetchCalendar,
  publicAddress,
  resolvePublic,
} from "../packages/ical/src/fetch";
import {
  validateCalendar,
  validateCalendarUrl,
} from "../packages/core/src/calendars";
import { evaluateScenario } from "../packages/core/src/scenarios";
const config = {
  name: "Work",
  owner: { name: "Тим", color: "blue" as const },
  timeZone: "Europe/Moscow",
  intervalSeconds: 60,
};
const now = Date.UTC(2026, 9, 23);
const fixture = readFileSync("tests/fixtures/calendar.ics", "utf8");
async function inZone(body = fixture) {
  const process = Bun.spawn(
    [Bun.which("bun")!, resolve("packages/ical/src/parse-cli.ts")],
    {
      env: { ...Bun.env, TZ: config.timeZone },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  process.stdin.write(JSON.stringify({ body, id: "cal-test", config, now }));
  process.stdin.end();
  const output = await new Response(process.stdout).text();
  assert.equal(await process.exited, 0);
  return JSON.parse(output) as ReturnType<typeof parseCalendar>;
}
it("expands recurrence with DST, exclusions, overrides and cancelled events", async () => {
  const events = await inZone();
  const weekly = events.filter((e) => e.id.startsWith("weekly:"));
  assert.equal(weekly.length, 3);
  assert.equal(weekly[0].startAt, Date.UTC(2026, 9, 24, 8));
  assert.equal(weekly[1].startAt, Date.UTC(2026, 9, 25, 9));
  assert.equal(weekly[2].startAt, Date.UTC(2026, 9, 27, 11));
  assert.equal(weekly[2].id, `weekly:${Date.UTC(2026, 9, 27, 9)}`);
  assert.ok(!events.some((e) => e.title === "Cancelled meeting"));
});
it("interprets floating times in the connection timezone and all-day deadlines at local day end", async () => {
  const events = await inZone();
  assert.equal(
    events.find((e) => e.id.startsWith("floating:"))!.startAt,
    Date.UTC(2026, 9, 25, 6),
  );
  const allDay = events.find((e) => e.allDay)!;
  assert.equal(allDay.deadlineAt, Date.UTC(2026, 9, 25, 21) - 1);
  const base = {
    id: "s",
    name: "Test",
    sourceId: "cal-test",
    enabled: true,
    leadMinutes: 10080,
    urgentMinutes: 1440,
    retainMinutes: 1440,
    filterText: "",
    nextRunAt: now,
    lastRunAt: null,
    lastError: null,
  };
  assert.equal(
    evaluateScenario({ ...base, definition: "meetings" }, [allDay], now).cards
      .length,
    0,
  );
  assert.equal(
    evaluateScenario({ ...base, definition: "deadlines" }, [allDay], now)
      .cards[0].targetAt,
    allDay.deadlineAt,
  );
});
it("rejects non-calendar content and validates connection settings", () => {
  assert.throws(() =>
    parseCalendar("<html>login page</html>", "cal-test", config, now),
  );
  assert.throws(() => validateCalendar({ ...config, intervalSeconds: 0 }));
  for (const url of [
    "http://example.com/a.ics",
    "https://user:pass@example.com/a",
    "https://example.com:444/a",
  ])
    assert.throws(() => validateCalendarUrl(url));
});
it("blocks private, loopback, mapped, link-local, reserved and mixed DNS results", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  await assert.rejects(
    resolvePublic("example.com", (async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]) as never),
  );
  await assert.rejects(fetchCalendar("https://127.0.0.1/private"));
  await assert.rejects(
    fetchCalendar("https://example.com", {}, async () => ({
      status: 302,
      body: "",
      location: "http://example.com/a",
    })),
  );
  await assert.rejects(
    fetchCalendar("https://example.com", {}, async () => ({
      status: 302,
      body: "",
      location: "https://example.com/loop",
    })),
  );
});
it("syncs into both scenarios, keeps data on failure, handles 304, and rejects stale in-flight results", async () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-ics-")),
    path = join(dir, "db.sqlite"),
    store = openStore(path);
  try {
    store.migrate();
    store.saveCalendar(
      "cal-test",
      config,
      "https://example.com/private-secret.ics",
    );
    const start = new Date(Date.now() + 30000)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
    const body = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:live\r\nDTSTART:${start}\r\nDURATION:PT30M\r\nSUMMARY:Реальная встреча\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    const row = store.dueCalendars()[0];
    await syncCalendar(store, row, async () => ({
      status: 200,
      body,
      etag: '"v1"',
    }));
    for (const definition of ["meetings", "deadlines"] as const)
      store.saveScenario(definition, {
        name: definition,
        definition,
        sourceId: "cal-test",
        enabled: true,
        leadMinutes: 10080,
        urgentMinutes: 1,
        retainMinutes: 5,
        filterText: "",
      });
    store.runDue();
    assert.equal(store.snapshot().cards.length, 2);
    const before = store.snapshot().cards;
    store.requestSync("cal-test");
    const cached = store.dueCalendars()[0];
    assert.ok(cached.cache);
    await syncCalendar(store, cached, async (_url, headers) => {
      assert.equal(headers?.["If-None-Match"], '"v1"');
      return { status: 304, body: "" };
    });
    assert.equal(store.listCalendars()[0].failures, 0);
    assert.ok(store.listCalendars()[0].checkedAt);
    store.requestSync("cal-test");
    await syncCalendar(store, store.dueCalendars()[0], async () => {
      throw new Error("network-error");
    });
    assert.deepEqual(store.snapshot().cards, before);
    assert.equal(store.listCalendars()[0].failures, 1);
    assert.ok(store.listCalendars()[0].checkedAt! >= cached.checkedAt!);
    assert.equal(
      JSON.stringify(store.listCalendars()).includes("private-secret"),
      false,
    );
    assert.equal(
      readFileSync(path).includes(Buffer.from("private-secret")),
      false,
    );
    assert.throws(() => store.deleteCalendar("cal-test"), /calendar-in-use/);
    store.saveCalendar(
      "cal-test",
      { ...config, name: "Edited" },
      "https://example.com/new.ics",
    );
    assert.equal(
      store.completeSync("cal-test", row.version, { events: [] }),
      false,
    );
    store.requestSync("cal-test");
    await syncCalendar(store, store.dueCalendars()[0], async () => ({
      status: 200,
      body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n",
    }));
    store.runDue();
    assert.equal(store.snapshot().cards.length, 0);
    store.deleteScenario("meetings");
    store.deleteScenario("deadlines");
    store.deleteCalendar("cal-test");
    assert.equal(store.listCalendars().length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});

it("refuses to replace a missing encryption key for existing calendars", () => {
  if (process.env.PEEK_ENCRYPTION_KEY) return;
  const dir = mkdtempSync(join(tmpdir(), "peek-key-"));
  const store = openStore(join(dir, "db.sqlite"));
  try {
    store.migrate();
    store.saveCalendar("cal-first", config, "https://example.com/secret.ics");
    const keyFile = join(dir, "secret.key");
    rmSync(keyFile);
    assert.throws(
      () =>
        store.saveCalendar(
          "cal-second",
          config,
          "https://example.com/other.ics",
        ),
      /encryption-key/,
    );
    assert.equal(existsSync(keyFile), false);
    assert.equal(store.listCalendars().length, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});

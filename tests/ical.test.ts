import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseCalendar } from "../extensions/official/ical/parse";

import {
  fetchCalendar,
  publicAddress,
  resolvePublic,
} from "../extensions/official/ical/fetch";
import { validateCalendarUrl } from "../extensions/official/ical/settings";
const config = {
  timeZone: "Europe/Moscow",
};
const now = Date.UTC(2026, 9, 23);
const fixture = readFileSync("tests/fixtures/calendar.ics", "utf8");
async function inZone(body = fixture) {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `import {parseCalendar} from './extensions/official/ical/parse';const {body,config,now}=JSON.parse(await Bun.stdin.text());console.log(JSON.stringify(parseCalendar(body,config,now)))`,
    ],
    {
      env: { ...process.env, TZ: config.timeZone },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  child.stdin.write(JSON.stringify({ body, config, now }));
  child.stdin.end();
  const output = await new Response(child.stdout).text();
  assert.equal(await child.exited, 0);
  return JSON.parse(output) as ReturnType<typeof parseCalendar>;
}
it("expands recurrence with DST, exclusions, overrides and cancelled events", async () => {
  const { events } = await inZone();
  const weekly = events
    .filter((e) => e.kind === "timed")
    .filter((e) => e.id.startsWith("weekly:"));
  assert.equal(weekly.length, 3);
  assert.equal(weekly[0].startAt, Date.UTC(2026, 9, 24, 8));
  assert.equal(weekly[1].startAt, Date.UTC(2026, 9, 25, 9));
  assert.equal(weekly[2].startAt, Date.UTC(2026, 9, 27, 11));
  assert.equal(weekly[2].id, `weekly:${Date.UTC(2026, 9, 27, 9)}`);
  assert.ok(!events.some((e) => e.title === "Cancelled meeting"));
});
it("interprets floating times in the connection timezone and all-day deadlines at local day end", async () => {
  const { events } = await inZone();
  assert.equal(
    events
      .filter((e) => e.kind === "timed")
      .find((e) => e.id.startsWith("floating:"))!.startAt,
    Date.UTC(2026, 9, 25, 6),
  );
  const allDay = events.find((e) => e.kind === "all-day")!;
  assert.equal(allDay.startDate, "2026-10-25");
  assert.equal(allDay.timeZone, "Europe/Moscow");
});
it("rejects non-calendar content and validates connection settings", () => {
  assert.throws(() => parseCalendar("<html>login page</html>", config, now));
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

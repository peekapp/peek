import { it } from "node:test";
import assert from "node:assert/strict";
import { formatTime, relativeEventTime } from "../packages/core/src/time";
it("formats English labels in Moscow across a UTC date boundary", () => {
  assert.deepEqual(formatTime(Date.UTC(2026, 9, 21, 22, 5)), {
    clock: "01:05",
    date: "Thursday, 22 October",
    event: "22 October, 01:05",
  });
});

it("uses calendar dates rather than a rolling 24-hour window", () => {
  const now = Date.UTC(2026, 9, 21, 20, 59); // 23:59 Moscow
  const tomorrow = now + 120000;
  assert.equal(relativeEventTime(now, now), "23:59");
  assert.equal(relativeEventTime(tomorrow, now), "Tomorrow, 00:01");
  assert.equal(relativeEventTime(tomorrow, now, "ru"), "Завтра, 00:01");
  assert.equal(relativeEventTime(now, tomorrow, "ru"), "Вчера, 23:59");
  assert.equal(relativeEventTime(tomorrow, tomorrow, "ru"), "00:01");
  assert.equal(relativeEventTime(now + 2 * 86400000, now), "Friday, 23:59");
  assert.equal(
    relativeEventTime(Date.UTC(2027, 0, 2, 9), now, "ru"),
    "2 января 2027, 12:00",
  );
});

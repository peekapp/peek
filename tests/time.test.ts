import { it } from "node:test";
import assert from "node:assert/strict";
import {
  formatTime as format,
  relativeEventTime as relative,
  relativeUpdateTime,
} from "../packages/core/src/time";
const formatTime = (timestamp: number) =>
  format(timestamp, "en", "Europe/Moscow");
const relativeEventTime = (
  timestamp: number,
  now: number,
  locale: "en" | "ru" = "en",
) => relative(timestamp, now, locale, "Europe/Moscow");
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

it("formats successful update ages compactly in both locales", () => {
  const now = Date.UTC(2026, 9, 26, 12);
  assert.equal(relativeUpdateTime(null, now, "en"), "Not updated yet");
  assert.equal(relativeUpdateTime(now, now, "en"), "Just now");
  assert.equal(relativeUpdateTime(now + 60000, now, "en"), "Just now");
  assert.equal(relativeUpdateTime(now - 39 * 60000, now, "en"), "39m ago");
  assert.equal(relativeUpdateTime(now - 60 * 60000, now, "en"), "1h ago");
  assert.equal(relativeUpdateTime(now - 1440 * 60000, now, "en"), "1d ago");
  assert.equal(relativeUpdateTime(now - 39 * 60000, now, "ru"), "39 мин назад");
  assert.equal(relativeUpdateTime(now - 60 * 60000, now, "ru"), "1 ч назад");
  assert.equal(relativeUpdateTime(now - 1440 * 60000, now, "ru"), "1 д назад");
});

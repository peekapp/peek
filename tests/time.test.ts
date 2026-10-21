import { it } from "node:test";
import assert from "node:assert/strict";
import { formatTime } from "../packages/core/src/time";
it("formats English labels in Moscow across a UTC date boundary", () => {
  assert.deepEqual(formatTime(Date.UTC(2026, 9, 21, 22, 5)), {
    clock: "01:05",
    date: "Thu, 22 October",
    event: "22 Oct, 01:05",
  });
});

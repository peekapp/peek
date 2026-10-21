import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activeCards,
  countdown,
  priorityAt,
  type Card,
} from "../packages/core/src/cards";
import { createDemoCards } from "../packages/core/src/demo";

const now = Date.UTC(2026, 9, 21, 12);
const cards = createDemoCards(now);
const meeting = cards[0];

describe("card lifecycle", () => {
  it("includes the visibility boundary and excludes the expiration boundary", () => {
    assert.equal(activeCards([meeting], meeting.visibleFrom - 1).length, 0);
    assert.equal(activeCards([meeting], meeting.visibleFrom).length, 1);
    assert.equal(activeCards([meeting], meeting.expiresAt - 1).length, 1);
    assert.equal(activeCards([meeting], meeting.expiresAt).length, 0);
  });
  it("raises meeting priority at exactly one minute", () => {
    assert.equal(priorityAt(meeting, meeting.urgentAt - 1), 2);
    assert.equal(priorityAt(meeting, meeting.urgentAt), 3);
  });
  it("does not show zero before a meeting starts or negative time afterwards", () => {
    assert.equal(countdown(meeting, meeting.targetAt - 1).value, "00:01");
    assert.equal(countdown(meeting, meeting.targetAt).value, "Started");
    assert.equal(countdown(meeting, meeting.targetAt + 1).value, "Started");
  });
  it("promotes a deadline when the meeting disappears", () => {
    assert.equal(activeCards(cards, now)[0].id, meeting.id);
    assert.equal(activeCards(cards, meeting.expiresAt)[0].id, "coursework");
  });
  it("marks a passed deadline, retaining it for exactly 24 hours", () => {
    const deadline = cards[1];
    assert.equal(priorityAt(deadline, deadline.urgentAt - 1), 1);
    assert.equal(priorityAt(deadline, deadline.urgentAt), 2);
    assert.equal(countdown(deadline, deadline.targetAt - 1).value, "1m");
    assert.equal(countdown(deadline, deadline.targetAt).value, "Overdue");
    assert.equal(
      activeCards([deadline], deadline.targetAt + 86400000 - 1).length,
      1,
    );
    assert.equal(
      activeCards([deadline], deadline.targetAt + 86400000).length,
      0,
    );
  });
  it("sorts by priority, target time, then stable ID without changing input", () => {
    const a: Card = { ...meeting, id: "a" };
    const b: Card = { ...meeting, id: "b" };
    const early: Card = {
      ...meeting,
      id: "early",
      targetAt: meeting.targetAt - 1,
    };
    const input = [b, a, early];
    assert.deepEqual(
      activeCards(input, now).map((c) => c.id),
      ["early", "a", "b"],
    );
    assert.deepEqual(
      input.map((c) => c.id),
      ["b", "a", "early"],
    );
  });
  it("expires everything after a long suspended-tab interval", () => {
    assert.deepEqual(activeCards(cards, now + 4 * 86400000), []);
  });
  it("keeps generated demo times stable and relative to the session", () => {
    assert.deepEqual(createDemoCards(now), cards);
    assert.equal(
      createDemoCards(now + 1000)[0].targetAt,
      meeting.targetAt + 1000,
    );
    assert.equal(countdown(meeting, now).value, "00:48");
  });
});

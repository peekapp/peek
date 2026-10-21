import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../packages/db/src";
import { createDemoCards } from "../packages/core/src/demo";
import { workerHealthy } from "../packages/core/src/state";

describe("persistent worker state", () => {
  it("migrates twice, survives restart, and never reseeds expired demo cards", () => {
    const dir = mkdtempSync(join(tmpdir(), "peek-"));
    const path = join(dir, "test.sqlite");
    let store = openStore(path);
    try {
      store.migrate();
      store.migrate();
      assert.equal(store.snapshot().cards.length, 0);
      const original = createDemoCards(1000000);
      assert.equal(store.seedDemo(original), true);
      store.tick(1000000);
      const first = store.snapshot();
      store.close();
      store = openStore(path);
      store.migrate();
      assert.equal(store.seedDemo(createDemoCards(2000000)), false);
      assert.deepEqual(store.snapshot().cards, first.cards);
      assert.equal(store.snapshot().heartbeat, 1000000);
      const reader = openStore(path, true);
      try {
        store.tick(original[0].expiresAt);
        assert.equal(reader.snapshot().cards.length, 3);
        assert.ok(reader.snapshot().revision > first.revision);
        store.tick(1000000 + 4 * 86400000);
        assert.equal(reader.snapshot().cards.length, 0);
        assert.equal(store.seedDemo(createDemoCards(Date.now())), false);
        store.stop();
        assert.equal(reader.snapshot().heartbeat, null);
      } finally {
        reader.close();
      }
    } finally {
      store.close();
      rmSync(dir, { recursive: true });
    }
  });
  it("rolls back the entire seed if an insert fails", () => {
    const store = openStore(":memory:");
    try {
      store.migrate();
      const cards = createDemoCards(1000);
      assert.throws(() => store.seedDemo([cards[0], cards[0]]));
      assert.equal(store.snapshot().cards.length, 0);
      assert.equal(store.snapshot().revision, 0);
      assert.equal(store.seedDemo(cards), true);
    } finally {
      store.close();
    }
  });
  it("detects a missing heartbeat after 30 seconds", () => {
    assert.equal(workerHealthy(null, 1000), false);
    assert.equal(workerHealthy(1000, 31000), true);
    assert.equal(workerHealthy(1000, 31001), false);
  });
});

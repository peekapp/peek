import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../packages/db/src";

import {
  officialStore,
  connection,
  scenario,
  publish,
  evaluate,
} from "./helpers/official";
it("resolves profile ownership and renames for SDK cards, protecting referenced profiles", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-profiles-")),
    path = join(dir, "db.sqlite");
  const main = openStore(path);
  main.migrate();
  const store = officialStore(path);
  try {
    main.saveProfile("profile-anna", { name: "Аня", color: "pink" });
    main.saveProfile("profile-tim", { name: "Tim", color: "blue" });
    const c = connection(store, "profile-anna");
    publish(store, c, [
      { id: "one", title: "Meeting", startAt: Date.now() + 30000 },
    ]);
    const s = scenario(store, [c], "profile-tim");
    evaluate(store, s);
    assert.equal(main.snapshot().cards[0].owner.name, "Tim");
    main.saveProfile("profile-tim", { name: "Тимофей", color: "green" });
    assert.equal(main.snapshot().cards[0].owner.name, "Тимофей");
    assert.equal(main.snapshot().cards[0].owner.color, "green");
    for (const id of ["profile-anna", "profile-tim"])
      assert.throws(() => main.deleteProfile(id), /profile-in-use/);
    assert.throws(() => main.deleteProfile("shared"), /invalid-profile/);
    assert.throws(() => scenario(store, [c], "missing"), /invalid-profile/);
    assert.throws(() => connection(store, "missing"), /invalid-profile/);
    store.removeInstance(s);
    store.removeInstance(c);
    main.deleteProfile("profile-anna");
    main.deleteProfile("profile-tim");
    assert.equal(main.listProfiles().length, 1);
  } finally {
    store.close();
    main.close();
    rmSync(dir, { recursive: true });
  }
});

it("supports every palette color through persistence and rejects unknown colors", async () => {
  const { profileColors } = await import("../packages/core/src/colors");
  const store = openStore(":memory:");
  try {
    store.migrate();
    for (const color of Object.keys(profileColors)) {
      store.saveProfile(`profile-${color}`, { name: color, color });
      assert.equal(
        store.listProfiles().find((p) => p.id === `profile-${color}`)?.color,
        color,
      );
    }
    for (const color of ["toString", "__proto__", "#fff", null])
      assert.throws(
        () => store.saveProfile("profile-invalid", { name: "Bad", color }),
        /invalid-profile/,
      );
  } finally {
    store.close();
  }
});

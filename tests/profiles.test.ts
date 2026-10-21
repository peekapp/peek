import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../packages/db/src";

it("persists profile ownership, resolves renames, and protects referenced and system profiles", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-profiles-"));
  const path = join(dir, "db.sqlite");
  let store = openStore(path);
  try {
    store.migrate();
    store.saveProfile("profile-anna", { name: "Аня", color: "pink" });
    store.saveProfile("profile-tim", { name: "Tim", color: "blue" });
    const config = {
      name: "Work",
      profileId: "profile-anna",
      timeZone: "Europe/Moscow",
      intervalSeconds: 60,
    };
    store.saveCalendar("cal-work", config, "https://example.com/work.ics");
    const now = Date.now();
    const event = {
      id: "one",
      sourceId: "cal-work",
      title: "Meeting",
      owner: { name: "Old source name", color: "blue" as const },
      startAt: now + 30000,
    };
    store.replaceSource("cal-work", [event]);
    const scenario = {
      name: "Meetings",
      definition: "meetings",
      profileId: "profile-tim",
      sourceId: "cal-work",
      enabled: true,
      leadMinutes: 10,
      urgentMinutes: 1,
      retainMinutes: 5,
      filterText: "",
    };
    store.saveScenario("meeting", scenario, now);
    store.runDue(now);
    assert.equal(store.snapshot().cards[0].owner.name, "Tim");
    assert.equal(store.listCalendars()[0].owner.name, "Аня");
    store.saveProfile("profile-tim", { name: "Тимофей", color: "green" });
    assert.equal(store.snapshot().cards[0].owner.name, "Тимофей");
    assert.equal(store.snapshot().cards[0].owner.color, "green");
    store.saveProfile("profile-anna", { name: "Anna", color: "green" });
    assert.equal(store.listCalendars()[0].owner.name, "Anna");
    assert.equal(store.dueCalendars()[0].config.owner.name, "Anna");
    assert.throws(() => store.deleteProfile("profile-anna"), /profile-in-use/);
    assert.throws(() => store.deleteProfile("profile-tim"), /profile-in-use/);
    assert.throws(() => store.deleteProfile("shared"), /invalid-profile/);
    assert.throws(
      () => store.saveProfile("shared", { name: "Changed", color: "pink" }),
      /invalid-profile/,
    );
    assert.throws(
      () =>
        store.saveScenario("invalid", { ...scenario, profileId: "missing" }),
      /invalid-profile/,
    );
    assert.throws(
      () =>
        store.saveCalendar(
          "cal-invalid",
          { ...config, profileId: "missing" },
          "https://example.com/no.ics",
        ),
      /invalid-profile/,
    );
    assert.throws(
      () => store.saveProfile("profile-empty", { name: " ", color: "blue" }),
      /invalid-profile/,
    );
    store.close();
    store = openStore(path);
    store.migrate();
    assert.equal(store.listScenarios()[0].profileId, "profile-tim");
    assert.equal(store.listCalendars()[0].profileId, "profile-anna");
    store.saveScenario("meeting", { ...scenario, profileId: "shared" }, now);
    store.deleteProfile("profile-tim");
    assert.equal(store.snapshot().cards[0].owner.system, true);
    store.deleteScenario("meeting");
    store.deleteCalendar("cal-work");
    store.deleteProfile("profile-anna");
    assert.equal(store.listProfiles().length, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});

it("migrates legacy connection owners once and binds their scenarios", async () => {
  const { Database } = await import("bun:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "peek-profile-migration-"));
  const path = join(dir, "db.sqlite");
  let store = openStore(path);
  try {
    store.migrate();
    store.close();
    const db = new Database(path);
    const legacy = {
      name: "Work",
      owner: { name: "Аня", color: "pink" },
      timeZone: "Europe/Moscow",
      intervalSeconds: 60,
    };
    for (const id of ["cal-one", "cal-two"])
      db.query(
        "INSERT INTO calendars (id, config, secret, version, next_sync, failures, event_count) VALUES (?, ?, 'untouched', 1, 12345, 0, 0)",
      ).run(id, JSON.stringify(legacy));
    db.query(
      "INSERT INTO scenarios (id, config, next_run_at) VALUES ('meeting', ?, 67890)",
    ).run(
      JSON.stringify({
        name: "Meeting",
        sourceId: "cal-one",
        definition: "meetings",
        enabled: true,
      }),
    );
    db.exec("DROP TABLE profiles; PRAGMA user_version = 4;");
    db.close();
    store = openStore(path);
    store.migrate();
    store.migrate();
    assert.equal(store.listProfiles().length, 2);
    const person = store.listProfiles().find((p) => !p.system)!;
    assert.equal(person.name, "Аня");
    assert.ok(
      store
        .listCalendars()
        .every((c) => c.profileId === person.id && c.nextSync === 12345),
    );
    assert.equal(store.listScenarios()[0].profileId, person.id);
    assert.equal(store.listScenarios()[0].nextRunAt, 67890);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});

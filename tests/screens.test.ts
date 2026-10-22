import {
  officialStore,
  connection,
  scenario,
  publish,
  evaluate,
} from "./helpers/official";
import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../packages/db/src";
import { validateScreen } from "../packages/core/src/screens";
import { formatTime, relativeEventTime } from "../packages/core/src/time";
const config = {
  name: "TV",
  allProfiles: true,
  profileIds: [],
  theme: "night",
  scale: 1,
  timeZone: "Europe/Moscow",
};
it("persists independent screens and filters by scenario owner, including shared and empty selections", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-screens-"));
  const path = join(dir, "db.sqlite");
  let store = openStore(path);
  store.migrate();
  const extensions = officialStore(path);
  try {
    store.migrate();
    store.migrate();
    assert.equal(store.listScreens().length, 1);
    store.saveProfile("profile-tim", { name: "Tim", color: "blue" });
    store.saveProfile("profile-anna", { name: "Anna", color: "pink" });
    const now = Date.now();
    const c = connection(extensions);
    publish(extensions, c, [
      { id: "event", title: "Test", startAt: now + 30000 },
    ]);
    for (const profileId of ["profile-tim", "profile-anna", "shared"])
      evaluate(extensions, scenario(extensions, [c], profileId), now);
    store.saveScreen("screen-tv", config);
    store.saveScreen("screen-room", {
      ...config,
      name: "Room",
      allProfiles: false,
      profileIds: ["profile-tim"],
      theme: "day",
      scale: 1.4,
      timeZone: "Asia/Tokyo",
    });
    assert.equal(store.snapshot(now, "screen-tv").cards.length, 3);
    const personal = store.snapshot(now, "screen-room");
    assert.deepEqual(
      personal.cards.map((c) => c.owner.profileId),
      ["profile-tim"],
    );
    assert.equal(personal.screen?.theme, "day");
    store.saveScreen("screen-room", {
      ...config,
      allProfiles: false,
      profileIds: ["profile-tim", "shared"],
    });
    assert.equal(store.snapshot(now, "screen-room").cards.length, 2);
    assert.ok(store.snapshot(now, "screen-room").revision > personal.revision);
    store.saveScreen("screen-room", {
      ...config,
      allProfiles: false,
      profileIds: [],
    });
    assert.equal(store.snapshot(now, "screen-room").cards.length, 0);
    store.close();
    store = openStore(path);
    store.migrate();
    assert.equal(store.listScreens().length, 3);
    assert.equal(store.snapshot(now, "screen-room").cards.length, 0);
    store.deleteScreen("screen-room");
    assert.throws(() => store.snapshot(now, "screen-room"), /screen-not-found/);
    assert.equal(
      extensions.instances().filter((i) => i.kind === "scenario").length,
      3,
    );
    assert.equal(store.snapshot(now, "screen-tv").cards.length, 3);
    store.saveProfile("profile-new", { name: "New", color: "blue" });
    store.saveScreen("screen-only", {
      ...config,
      allProfiles: false,
      profileIds: ["profile-new"],
    });
    assert.throws(() => store.deleteProfile("profile-new"), /profile-in-use/);
    store.deleteScreen("screen-only");
    store.deleteProfile("profile-new");
    assert.throws(
      () =>
        store.saveScreen("screen-bad", {
          ...config,
          allProfiles: false,
          profileIds: ["missing"],
        }),
      /invalid-profile/,
    );
    assert.equal(
      store.listScreens().some((s) => s.id === "screen-bad"),
      false,
    );
  } finally {
    extensions.close();
    store.close();
    rmSync(dir, { recursive: true });
  }
});
it("rejects malformed screen settings and uses the selected display timezone", () => {
  for (const patch of [
    { name: " " },
    { scale: 0 },
    { scale: 10 },
    { theme: "__proto__" },
    { profileIds: [null] },
    { allProfiles: "yes" },
  ])
    assert.throws(
      () => validateScreen({ ...config, ...patch }),
      /invalid-screen/,
    );
  const timestamp = Date.UTC(2026, 9, 21, 22, 0);
  assert.equal(formatTime(timestamp, "en", "UTC").clock, "22:00");
  assert.equal(formatTime(timestamp, "en", "Asia/Tokyo").clock, "07:00");
  assert.equal(
    relativeEventTime(timestamp, timestamp - 3600000, "en", "UTC"),
    "22:00",
  );
});
it("only reports errors from sources used by the selected profiles", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-screen-errors-"));
  const store = openStore(join(dir, "db.sqlite"));
  store.migrate();
  const extensions = officialStore(join(dir, "db.sqlite"));
  try {
    store.migrate();
    const c = connection(extensions);
    scenario(extensions, [c]);
    assert.equal(store.snapshot(Date.now(), "default").integrationErrors, 1);
    store.saveProfile("profile-alone", { name: "Alone", color: "blue" });
    store.saveScreen("screen-empty", {
      ...config,
      allProfiles: false,
      profileIds: ["profile-alone"],
    });
    assert.equal(
      store.snapshot(Date.now(), "screen-empty").integrationErrors,
      0,
    );
    assert.equal(store.snapshot(Date.now(), "screen-empty").scenarioErrors, 0);
    store.saveScreen("screen-empty", {
      ...config,
      allProfiles: false,
      profileIds: ["shared"],
    });
    assert.equal(
      store.snapshot(Date.now(), "screen-empty").integrationErrors,
      1,
    );
  } finally {
    extensions.close();
    store.close();
    rmSync(dir, { recursive: true });
  }
});

it("creates unique readable IDs, renames atomically and preserves multilingual names", () => {
  const store = openStore(":memory:");
  try {
    store.migrate();
    assert.equal(store.listScreens()[0].id, "default");
    assert.equal(store.listScreens()[0].name, "Default");
    store.saveScreen(
      "family-tv",
      { ...config, name: "Семейный телевизор" },
      null,
    );
    assert.throws(
      () => store.saveScreen("family-tv", config, null),
      /screen-id-taken/,
    );
    assert.throws(
      () => store.saveScreen("default", config, "family-tv"),
      /screen-id-taken/,
    );
    assert.equal(
      store.snapshot(Date.now(), "family-tv").screen?.name,
      "Семейный телевизор",
    );
    store.saveScreen("living-room", config, "family-tv");
    assert.throws(
      () => store.snapshot(Date.now(), "family-tv"),
      /screen-not-found/,
    );
    assert.equal(store.snapshot(Date.now(), "living-room").screen?.name, "TV");
    for (const id of [
      "new",
      "Bad Name",
      "two--hyphens",
      "-start",
      "end-",
      "Русский",
      "x".repeat(65),
    ])
      assert.throws(
        () => store.saveScreen(id, config, null),
        /invalid-screen-id/,
      );
  } finally {
    store.close();
  }
});
it("uses the server timezone, with environment overrides taking precedence", async () => {
  const { installationTimeZone } = await import("../packages/db/src");
  const saved = { peek: process.env.PEEK_TIMEZONE, tz: process.env.TZ };
  try {
    process.env.PEEK_TIMEZONE = "Asia/Tokyo";
    process.env.TZ = "UTC";
    assert.equal(installationTimeZone(), "Asia/Tokyo");
    const store = openStore(":memory:");
    try {
      store.migrate();
      assert.equal(store.snapshot().timeZone, "Asia/Tokyo");
    } finally {
      store.close();
    }
    delete process.env.PEEK_TIMEZONE;
    assert.equal(installationTimeZone(), "UTC");
    delete process.env.TZ;
    assert.equal(
      installationTimeZone(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    process.env.PEEK_TIMEZONE = "invalid-zone";
    assert.throws(installationTimeZone, /Invalid PEEK_TIMEZONE/);
  } finally {
    if (saved.peek === undefined) delete process.env.PEEK_TIMEZONE;
    else process.env.PEEK_TIMEZONE = saved.peek;
    if (saved.tz === undefined) delete process.env.TZ;
    else process.env.TZ = saved.tz;
  }
});

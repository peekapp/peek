import { it } from "node:test";
import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../packages/db/src";
import { resolveTheme, themes } from "../packages/core/src/themes";

it("persists the app theme, publishes revisions, and keeps screen overrides independent", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-themes-"));
  const path = join(dir, "db.sqlite");
  let store = openStore(path);
  try {
    store.migrate();
    const screen = store.listScreens()[0]!;
    assert.equal(screen.theme, "inherit");
    store.saveScreen("light", { ...screen, theme: "day" });
    for (const theme of themes) {
      const revision = store.snapshot().revision;
      store.setTheme(theme);
      const inherited = store.snapshot(Date.now(), screen.id);
      const overridden = store.snapshot(Date.now(), "light");
      assert.ok(inherited.revision > revision);
      assert.equal(
        resolveTheme(inherited.screen?.theme, inherited.theme),
        theme,
      );
      assert.equal(
        resolveTheme(overridden.screen?.theme, overridden.theme),
        "day",
      );
    }
    assert.throws(() => store.setTheme("inherit"), /invalid/);
    assert.throws(() => store.setTheme("__proto__"), /invalid/);
    store.close();
    store = openStore(path);
    assert.equal(store.snapshot().theme, themes.at(-1));
    assert.equal(
      store.listScreens().find((s) => s.id === "light")?.theme,
      "day",
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("migrates standard screens to inheritance while preserving explicit light screens", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-theme-migration-"));
  const path = join(dir, "db.sqlite");
  let store = openStore(path);
  try {
    store.migrate();
    const screen = store.listScreens()[0]!;
    store.saveScreen(screen.id, { ...screen, theme: "night" }, screen.id);
    store.saveScreen("light", { ...screen, theme: "day" });
    store.close();
    const db = new Database(path);
    db.exec(
      "ALTER TABLE screen_state DROP COLUMN theme; PRAGMA user_version = 7;",
    );
    db.close();
    store = openStore(path);
    store.migrate();
    store.migrate();
    assert.equal(store.snapshot().theme, "night");
    assert.equal(
      store.listScreens().find((s) => s.id === screen.id)?.theme,
      "inherit",
    );
    assert.equal(
      store.listScreens().find((s) => s.id === "light")?.theme,
      "day",
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

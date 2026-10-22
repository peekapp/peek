import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openStore } from "../packages/db/src";
import { createDemoCards } from "../packages/core/src/demo";

it("runs as a separate process and preserves cards across worker restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-worker-"));
  const path = join(dir, "state.sqlite");
  const store = openStore(path);
  const input = createDemoCards(Date.now());
  const expected = input;
  store.migrate();
  store.seedDemo(input);
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    for (let restart = 0; restart < 2; restart++) {
      child = Bun.spawn([process.execPath, "src/index.ts"], {
        cwd: resolve("apps/worker"),
        env: { ...process.env, PEEK_DATABASE_PATH: path },
        stdout: "ignore",
        stderr: "inherit",
      });
      const deadline = Date.now() + 5000;
      while (store.snapshot().heartbeat === null && Date.now() < deadline)
        await Bun.sleep(20);
      assert.notEqual(store.snapshot().heartbeat, null);
      assert.deepEqual(store.snapshot().cards, expected);
      child.kill("SIGTERM");
      assert.equal(await child.exited, 0);
      assert.equal(store.snapshot().heartbeat, null);
      child = undefined;
    }
  } finally {
    if (child) {
      child.kill();
      await child.exited;
    }
    store.close();
    rmSync(dir, { recursive: true });
  }
});

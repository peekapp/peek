import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../packages/db/src";
import { screenStream } from "../apps/web/lib/screen-stream";

test("slow screen clients skip intermediate snapshots and resume with current state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-stream-"));
  const previous = process.env.PEEK_DATABASE_PATH;
  process.env.PEEK_DATABASE_PATH = join(dir, "peek.sqlite");
  const store = openStore(process.env.PEEK_DATABASE_PATH);
  store.migrate();
  const request = () => new Request("http://localhost/api/screen/events");
  const reader = screenStream(request()).body!.getReader();
  try {
    for (let i = 0; i < 3; i++) {
      store.tick(i);
      await screenStream(request()).body!.cancel();
    }
    await reader.read(); // Consume the single queued initial snapshot.
    const pending = reader.read();
    store.tick(42);
    await screenStream(request()).body!.cancel();
    const { value } = await pending;
    const frame = new TextDecoder().decode(value);
    expect(JSON.parse(frame.slice(6)).heartbeat).toBe(42);
  } finally {
    await reader.cancel();
    store.close();
    if (previous === undefined) delete process.env.PEEK_DATABASE_PATH;
    else process.env.PEEK_DATABASE_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

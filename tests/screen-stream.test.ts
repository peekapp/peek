import { expect, spyOn, test } from "bun:test";
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
    store.setLocale("ru");
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

test("screen streams suppress unchanged content, heartbeat, recover and reconnect with full snapshots", async () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-stream-"));
  const previous = process.env.PEEK_DATABASE_PATH;
  process.env.PEEK_DATABASE_PATH = join(dir, "peek.sqlite");
  const store = openStore(process.env.PEEK_DATABASE_PATH);
  store.migrate();
  let now = 100000;
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  const request = () => new Request("http://localhost/api/screen/events");
  const reader = screenStream(request()).body!.getReader();
  const decode = (value?: Uint8Array) => new TextDecoder().decode(value);
  // Opening another stream also polls existing clients, without waiting on real timers.
  const poll = async () => { await screenStream(request()).body!.cancel(); };
  try {
    expect(JSON.parse(decode((await reader.read()).value).slice(6)).cards).toEqual([]);
    let delivered = false;
    const pending = reader.read().then((result) => { delivered = true; return result; });
    now += 1000;
    store.tick(now); // Changes revision and health, but not screen content.
    await poll();
    await Promise.resolve();
    expect(delivered).toBe(false);
    now += 4000;
    await poll();
    const frame = decode((await pending).value);
    expect(frame).toStartWith("event: heartbeat\n");
    expect(JSON.parse(frame.split("data: ")[1])).toEqual({ serverTime: now, heartbeat: now - 4000 });

    now += 1000;
    store.setLocale("ru");
    await poll();
    expect(JSON.parse(decode((await reader.read()).value).slice(6)).locale).toBe("ru");

    const reconnect = screenStream(request()).body!.getReader();
    const initial = decode((await reconnect.read()).value);
    expect(initial).toStartWith("data: ");
    expect(JSON.parse(initial.slice(6)).locale).toBe("ru");
    expect(JSON.parse(initial.slice(6)).cards).toEqual([]);
    await reconnect.cancel();

    process.env.PEEK_DATABASE_PATH = join(dir, "missing", "peek.sqlite");
    await poll();
    expect(decode((await reader.read()).value)).toStartWith("event: unavailable\n");
    process.env.PEEK_DATABASE_PATH = join(dir, "peek.sqlite");
    await poll();
    expect(decode((await reader.read()).value)).toStartWith("data: ");

    const screen = screenStream(request(), "default").body!.getReader();
    await screen.read();
    store.deleteScreen("default");
    await poll();
    expect(decode((await screen.read()).value)).toStartWith("event: removed\n");
    await screen.cancel();
  } finally {
    await reader.cancel();
    clock.mockRestore();
    store.close();
    if (previous === undefined) delete process.env.PEEK_DATABASE_PATH;
    else process.env.PEEK_DATABASE_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

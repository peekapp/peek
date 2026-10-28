import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../packages/db/src";
import { officialStore, connection, scenario } from "./helpers/official";
import { GET } from "../apps/web/app/api/scenarios/[id]/cards/route";

test("scenario cards endpoint reads all stored cards for one scenario and guards requests", async () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-cards-"));
  const path = join(dir, "test.sqlite");
  const oldPath = process.env.PEEK_DATABASE_PATH;
  const oldZone = process.env.PEEK_TIMEZONE;
  const main = openStore(path); main.migrate(); main.close();
  const store = officialStore(path);
  const source = connection(store);
  const id = scenario(store, [source]);
  const other = scenario(store, [source]);
  const empty = scenario(store, [source]);
  const db = new Database(path);
  const now = Date.now();
  const cards = [
    { id: "future", targetAt: now + 100000, visibleFrom: now + 50000, expiresAt: now + 200000 },
    { id: "expired", targetAt: now - 100000, visibleFrom: now - 200000, expiresAt: now - 50000 },
    { id: "a", targetAt: now + 100000, visibleFrom: now, expiresAt: now + 200000 },
  ].map((card) => ({ ...card, title: card.id, kind: "info", owner: { name: "Shared", color: "blue" }, urgentAt: card.targetAt, priority: 1, urgentPriority: 1 }));
  for (const card of cards) db.run("INSERT INTO cards(id,payload,expires_at,scenario_id) VALUES(?,?,?,?)", [card.id, JSON.stringify(card), card.expiresAt, id]);
  db.run("INSERT INTO cards(id,payload,expires_at,scenario_id) VALUES(?,?,?,?)", ["other", JSON.stringify({ ...cards[0], id: "other" }), cards[0]!.expiresAt, other]);
  db.close();
  process.env.PEEK_DATABASE_PATH = path;
  process.env.PEEK_TIMEZONE = "Europe/Moscow";
  const get = (id: string, host = "localhost") => GET(new Request(`http://localhost/api/scenarios/${id}/cards`, { headers: { host } }), { params: Promise.resolve({ id }) });
  try {
    const response = await get(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ cards: [cards[1], cards[2], cards[0]], timeZone: "Europe/Moscow" });
    expect(store.status().instances.find((instance) => instance.id === id)?.cardCount).toBe(3);
    expect((await (await get(empty)).json()).cards).toEqual([]);
    for (const missing of ["missing", source]) expect((await get(missing)).status).toBe(404);
    expect((await get(id, "attacker.example")).status).toBe(403);
  } finally {
    if (oldPath === undefined) delete process.env.PEEK_DATABASE_PATH; else process.env.PEEK_DATABASE_PATH = oldPath;
    if (oldZone === undefined) delete process.env.PEEK_TIMEZONE; else process.env.PEEK_TIMEZONE = oldZone;
    store.close(); rmSync(dir, { recursive: true, force: true });
  }
});

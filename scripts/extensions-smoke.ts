import assert from "node:assert/strict";
import {
  encode,
  type ExtensionPackage,
} from "../packages/extensions/src/archive";
const base = process.env.PEEK_TEST_URL ?? "http://localhost:3114";
async function request(action: unknown) {
  const r = await fetch(`${base}/api/extensions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(action),
  });
  const result = await r.json();
  assert.equal(r.status, 200, JSON.stringify(result));
  return result;
}
async function status() {
  const r = await fetch(`${base}/api/extensions`);
  assert.equal(r.status, 200);
  return r.json();
}
async function until(fn: () => Promise<boolean>) {
  const deadline = Date.now() + 40000;
  while (!(await fn())) {
    if (Date.now() > deadline)
      throw new Error("Extension smoke test timed out");
    await Bun.sleep(250);
  }
}
await until(async () => (await status()).runtime.ready);
if (process.argv[2] !== "verify") {
  const source: ExtensionPackage = {
    manifest: {
      format: 2,
      sdk: "^0.1.0",
      id: "ci/source",
      version: "0.1.0",
      kind: "connection",
      name: "CI source",
      description: "Disposable smoke test",
      author: "Peek CI",
      entry: "index.mjs",
      settings: { type: "object" },
      permissions: {},
      provides: {
        items: {
          id: "ci/items",
          version: "1.0.0",
          schema: { type: "array", items: { type: "string" } },
        },
      },
    },
    files: {
      "index.mjs":
        "export default {run({now}){return {datasets:{items:['Extension smoke passed']},nextRunAt:now+60000}}}",
    },
  };
  const scenario: ExtensionPackage = {
    manifest: {
      format: 2,
      sdk: "^0.1.0",
      id: "ci/cards",
      version: "0.1.0",
      kind: "scenario",
      name: "CI cards",
      description: "Disposable smoke test",
      author: "Peek CI",
      entry: "index.mjs",
      settings: { type: "object" },
      permissions: {},
      contracts: [source.manifest.provides!.items],
      inputs: { items: { contract: "ci/items", version: "^1.0.0" } },
      dependencies: [{ id: "ci/source", version: "^0.1.0" }],
    },
    files: {
      "index.mjs":
        "export default {evaluate({inputs,now}){return {cards:inputs.items.flatMap(s=>s.data.map((title,index)=>({id:String(index),title,visibleFrom:now,targetAt:now+60000,expiresAt:now+300000}))),nextRunAt:now+60000}}}",
    },
  };
  const r = await fetch(`${base}/api/extensions`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", Origin: base },
    body: encode([source, scenario]),
  });
  assert.equal(r.status, 200);
  const review = await r.json();
  await request({ action: "confirm", id: review.id });
  await until(async () =>
    (await status()).packages.some(
      (p: { manifest: { id: string } }) => p.manifest.id === "ci/cards",
    ),
  );
  const c = await request({
    action: "save",
    instance: {
      packageId: "ci/source",
      name: "CI source",
      profileId: "shared",
      settings: {},
      bindings: {},
      enabled: true,
    },
  });
  await request({
    action: "save",
    instance: {
      packageId: "ci/cards",
      name: "CI cards",
      profileId: "shared",
      settings: {},
      bindings: { items: [{ connectionId: c.id, dataset: "items" }] },
      enabled: true,
    },
  });
}
await until(async () => {
  const r = await fetch(`${base}/api/screen`);
  if (!r.ok) return false;
  return (await r.json()).cards.some(
    (c: { title: string }) => c.title === "Extension smoke passed",
  );
});
console.log(
  "Extension package installation, connection and card verified over HTTP.",
);

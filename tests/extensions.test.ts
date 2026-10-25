import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { openStore } from "../packages/db/src";
import { openExtensions } from "../packages/extensions/src/store";
import {
  encode,
  decode,
  type ExtensionPackage,
} from "../packages/extensions/src/archive";
import { manifest } from "../packages/extensions/src/validation";
function pkg(
  kind: "scenario" | "connection",
  version = "0.1.0",
): ExtensionPackage {
  return {
    manifest: {
      format: 2,
      sdk: "^0.1.0",
      id: `test/${kind}`,
      version,
      kind,
      name: kind,
      description: "Test extension",
      author: "Tests",
      entry: "index.mjs",
      settings: { type: "object", properties: { label: { type: "string" } } },
      permissions: {},
      ...(kind === "connection"
        ? {
            secrets: {
              type: "object",
              properties: { token: { type: "string" } },
              required: ["token"],
            },
            provides: {
              items: {
                id: "test/items",
                version: "1.0.0",
                schema: { type: "array", items: { type: "string" } },
              },
            },
          }
        : {
            contracts: [
              {
                id: "test/items",
                version: "1.0.0",
                schema: { type: "array", items: { type: "string" } },
              },
            ],
            inputs: {
              items: {
                contract: "test/items",
                version: "^1.0.0",
                multiple: true,
              },
            },
            dependencies: [{ id: "test/connection", version: "^0.1.0" }],
          }),
    },
    files: { "index.mjs": "export default {};" },
  };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "peek-ext-"));
  const path = join(dir, "peek.sqlite");
  const main = openStore(path);
  main.migrate();
  const store = openExtensions(path);
  return {
    main,
    store,
    path,
    close() {
      store.close();
      main.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
function install(
  store: ReturnType<typeof openExtensions>,
  packages: ExtensionPackage[],
) {
  const review = store.stage(packages, ["test/scenario"]);
  store.confirm(review.id);
  const op = store.pending()!;
  const input = store.installInput(op);
  try {
    store.commitInstall(op, input.affected, {});
  } catch (error) {
    store.fail(op.id, String(error));
    throw error;
  }
}
test("package archive rejects traversal, duplicate identities, corrupted data and scenario permissions", () => {
  const p = pkg("scenario");
  expect(decode(encode([p])).packages[0]).toEqual(p);
  expect(() => manifest({ ...p.manifest, format: 1 })).toThrow(
    "invalid-manifest",
  );
  expect(() => manifest({ ...p.manifest, kind: "integration" })).toThrow(
    "invalid-manifest",
  );
  expect(() =>
    decode(
      gzipSync(
        JSON.stringify({
          format: "peek-bundle-1",
          packages: [
            { ...p, files: { "index.mjs": "", "../secret.key": "bad" } },
          ],
        }),
      ),
    ),
  ).toThrow();
  expect(() => encode([p, p])).toThrow();
  expect(() => decode(Buffer.from("bad"))).toThrow();
  expect(() =>
    manifest({ ...p.manifest, permissions: { internet: true } }),
  ).toThrow("scenario-permissions-forbidden");
  expect(() =>
    manifest({
      ...p.manifest,
      settings: { $ref: "https://evil.example/schema" },
    }),
  ).toThrow();
});
test("install resolves dependencies, shares connections and never returns secrets", () => {
  const f = fixture();
  try {
    expect(() => f.store.stage([pkg("scenario")], ["test/scenario"])).toThrow(
      "dependency-conflict",
    );
    install(f.store, [pkg("scenario"), pkg("connection")]);
    const c = f.store.save({
      packageId: "test/connection",
      name: "Source",
      profileId: "shared",
      settings: {},
      secrets: { token: "sensitive-token" },
      bindings: {},
      enabled: true,
    });
    const s = f.store.save({
      packageId: "test/scenario",
      name: "Screen",
      profileId: "shared",
      settings: {},
      bindings: { items: [{ connectionId: c, dataset: "items" }] },
      enabled: true,
    });
    expect(JSON.stringify(f.store.status())).not.toContain("sensitive-token");
    expect(f.store.context(f.store.instance(c)!).secrets).toEqual({
      token: "sensitive-token",
    });
    expect(f.store.context(f.store.instance(s)!).secrets).toBeUndefined();
    expect(() => f.store.removePackage("test/connection")).toThrow(
      "package-in-use",
    );
    expect(() => f.store.removeInstance(c)).toThrow("connection-in-use");
    f.store.removeInstance(s);
    expect(f.store.instance(c)).not.toBeNull();
    f.store.removePackage("test/scenario");
    expect(() => f.store.removePackage("test/connection")).toThrow();
    f.store.removeInstance(c);
    f.store.removePackage("test/connection");
    expect(f.store.installed()).toHaveLength(0);
  } finally {
    f.close();
  }
});
test("publishing validates data, scopes cards and rejects stale and deleted results", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("connection")]);
    const c = f.store.save({
      packageId: "test/connection",
      name: "Source",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    const bindings = { items: [{ connectionId: c, dataset: "items" }] };
    const s = f.store.save({
      packageId: "test/scenario",
      name: "Screen",
      profileId: "shared",
      settings: {},
      bindings,
      enabled: true,
    });
    const stale = f.store.instance(s)!;
    f.store.publish(f.store.instance(c)!, { datasets: { items: ["a"] } });
    expect(f.store.context(f.store.instance(s)!).inputs.items[0].data).toEqual([
      "a",
    ]);
    const now = Date.now(),
      result = {
        cards: [
          {
            id: "1",
            title: "A",
            visibleFrom: now - 1,
            targetAt: now + 60000,
            expiresAt: now + 60000,
          },
        ],
        nextRunAt: null,
      };
    expect(f.store.publish(stale, result)).toBe(true);
    expect(f.store.due().some((i) => i.id === s)).toBe(true);
    expect(f.store.publish(f.store.instance(s)!, result)).toBe(true);
    expect(f.main.snapshot().cards[0].title).toBe("A");
    expect(() =>
      f.store.publish(f.store.instance(c)!, { datasets: { items: [42] } }),
    ).toThrow();
    expect(f.store.context(f.store.instance(s)!).inputs.items[0].data).toEqual([
      "a",
    ]);
    const running = f.store.instance(s)!;
    f.store.removeInstance(s);
    expect(f.store.publish(running, result)).toBe(false);
    expect(f.main.snapshot().cards).toHaveLength(0);
  } finally {
    f.close();
  }
});
test("failed migration rolls back transaction; immutable versions and coherent rollback", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("connection")]);
    const c = f.store.save({
      packageId: "test/connection",
      name: "Source",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    const changed = pkg("connection");
    changed.files["index.mjs"] = "different";
    expect(() => f.store.stage([changed], [])).toThrow("immutable-version");
    const newer = pkg("connection", "0.1.1");
    newer.manifest.settings = {
      type: "object",
      required: ["label"],
      properties: { label: { type: "string" } },
    };
    const preview = f.store.stage([newer], []);
    f.store.confirm(preview.id);
    const op = f.store.pending()!,
      { affected } = f.store.installInput(op);
    expect(() => f.store.commitInstall(op, affected, {})).toThrow();
    expect(f.store.getPackage("test/connection").manifest.version).toBe(
      "0.1.0",
    );
    f.store.commitInstall(op, affected, {
      [c]: { settings: { label: "migrated" }, state: null },
    });
    expect(f.store.getPackage("test/connection").manifest.version).toBe(
      "0.1.1",
    );
    f.store.rollback();
    expect(f.store.getPackage("test/connection").manifest.version).toBe(
      "0.1.0",
    );
    expect(JSON.parse(f.store.instance(c)!.settings)).toEqual({});
  } finally {
    f.close();
  }
});
test("unchanged installs preserve rollback, cards and scheduling while promoting explicit packages", () => {
  const f = fixture();
  try {
    const source = pkg("connection");
    const cards = pkg("scenario");
    cards.manifest.inputs = {};
    install(f.store, [source, cards]);
    const id = f.store.save({
      packageId: cards.manifest.id,
      name: "Cards",
      profileId: "shared",
      settings: {},
      bindings: {},
      enabled: true,
    });
    const newer = structuredClone(cards);
    newer.manifest.version = "0.1.1";
    install(f.store, [newer]);
    const now = Date.now();
    f.store.publish(f.store.instance(id)!, {
      cards: [
        {
          id: "one",
          title: "Keep",
          visibleFrom: now,
          targetAt: now + 60000,
          expiresAt: now + 60000,
        },
      ],
      nextRunAt: null,
    });
    const before = f.store.instance(id);
    const snapshot = f.main.snapshot(now);
    const review = f.store.stage(
      [source, newer],
      [source.manifest.id, newer.manifest.id],
    );
    f.store.confirm(review.id);
    const op = f.store.pending()!;
    const input = f.store.installInput(op);
    expect(input.packages).toHaveLength(0);
    f.store.commitInstall(op, input.affected, {});
    expect(f.store.instance(id)).toEqual(before);
    expect(f.main.snapshot(now)).toEqual(snapshot);
    expect(
      f.store.installed().find((p) => p.id === source.manifest.id)!.explicit,
    ).toBe(1);
    expect(
      f.store.status().operations.find((o) => o.id === op.id)!.status,
    ).toBe("complete");
    f.store.rollback();
    expect(f.store.getPackage(cards.manifest.id).manifest.version).toBe(
      "0.1.0",
    );
  } finally {
    f.close();
  }
});

test("changes after review and new instances during migration invalidate commit", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("connection")]);
    const preview = f.store.stage([pkg("connection", "0.1.1")], []);
    f.store.confirm(preview.id);
    const op = f.store.pending()!;
    const { affected } = f.store.installInput(op);
    f.store.save({
      packageId: "test/connection",
      name: "New",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    expect(() => f.store.commitInstall(op, affected, {})).toThrow(
      "instance-changed",
    );
  } finally {
    f.close();
  }
});
test("enabled persistent connections recover after a runner restart", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("connection")]);
    const id = f.store.save({
      packageId: "test/connection",
      name: "Persistent",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    f.store.publish(f.store.instance(id)!, {
      datasets: { items: ["snapshot"] },
      state: { cursor: 42 },
      nextRunAt: null,
    });
    expect(f.store.due().filter((i) => i.id === id)).toHaveLength(0);
    f.store.recover();
    expect(f.store.due().some((i) => i.id === id)).toBe(true);
    expect(f.store.context(f.store.instance(id)!).state).toEqual({
      cursor: 42,
    });
  } finally {
    f.close();
  }
});

test("bindings reject duplicate datasets and malformed entries before saving", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("connection")]);
    const c = f.store.save({
      packageId: "test/connection",
      name: "Source",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    const input = {
      packageId: "test/scenario",
      name: "Screen",
      profileId: "shared",
      settings: {},
      enabled: true,
      bindings: { items: [{ connectionId: c, dataset: "items" }] },
    };
    expect(() =>
      f.store.save({
        ...input,
        bindings: { items: [...input.bindings.items, ...input.bindings.items] },
      }),
    ).toThrow("duplicate-binding");
    expect(() =>
      f.store.save({ ...input, bindings: { items: [null as any] } }),
    ).toThrow("invalid-bindings");
    expect(f.store.instances()).toHaveLength(1);
    expect(f.store.save(input)).toBeString();
  } finally {
    f.close();
  }
});

test("rollback schedules using the current enabled state", () => {
  for (const enabled of [true, false]) {
    const f = fixture();
    try {
      install(f.store, [pkg("connection")]);
      const input = {
        packageId: "test/connection",
        name: "Source",
        profileId: "shared",
        settings: {},
        secrets: { token: "x" },
        bindings: {},
        enabled,
      };
      const id = f.store.save(input);
      install(f.store, [pkg("connection", "0.1.1")]);
      f.store.save({ ...input, id, enabled: !enabled });
      const stale = f.store.instance(id)!;
      f.store.rollback();
      const restored = f.store.instance(id)!;
      expect(restored.enabled).toBe(Number(!enabled));
      expect(restored.next_run_at !== null).toBe(!enabled);
      expect(f.store.due().some((i) => i.id === id)).toBe(!enabled);
      expect(f.store.publish(stale, { datasets: { items: [] } })).toBe(false);
    } finally {
      f.close();
    }
  }
});

test("migration enforces the same settings size limit as instance saves", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("connection")]);
    const id = f.store.save({
      packageId: "test/connection",
      name: "Source",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    const review = f.store.stage([pkg("connection", "0.1.1")], []);
    f.store.confirm(review.id);
    const op = f.store.pending()!;
    expect(() =>
      f.store.commitInstall(op, f.store.installInput(op).affected, {
        [id]: { settings: { label: "x".repeat(1024 * 1024) }, state: null },
      }),
    ).toThrow("payload-too-large");
    expect(f.store.getPackage("test/connection").manifest.version).toBe(
      "0.1.0",
    );
    expect(f.store.instance(id)!.settings).toBe("{}");
  } finally {
    f.close();
  }
});

function sourceInput(packageId = "test/connection") {
  return {
    packageId,
    name: "Source",
    profileId: "shared",
    settings: {},
    secrets: { token: "x" },
    bindings: {},
    enabled: true,
  };
}
function scenarioInput(connectionId: string) {
  return {
    packageId: "test/scenario",
    name: "Cards",
    profileId: "shared",
    settings: {},
    bindings: { items: [{ connectionId, dataset: "items" }] },
    enabled: true,
  };
}
test("live updates coalesce without cancelling in-flight results; configuration still invalidates", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("connection"), pkg("scenario")]);
    const c = f.store.save(sourceInput()),
      input = scenarioInput(c),
      s = f.store.save(input);
    const running = f.store.instance(s)!;
    for (let n = 0; n < 50; n++)
      f.store.publish(f.store.instance(c)!, {
        datasets: { items: [String(n)] },
      });
    expect(f.store.executionStatus(s)?.generation).toBe(running.generation);
    expect(f.store.publish(running, { cards: [], nextRunAt: null })).toBe(true);
    expect(f.store.due().filter((i) => i.id === s)).toHaveLength(1);
    const followup = f.store.instance(s)!;
    expect(f.store.context(followup).inputs.items[0].data).toEqual(["49"]);
    f.store.publish(followup, { cards: [], nextRunAt: null });
    expect(f.store.due().some((i) => i.id === s)).toBe(false);
    f.store.save({ ...input, id: s, settings: { label: "changed" } });
    expect(f.store.publish(followup, { cards: [], nextRunAt: null })).toBe(
      false,
    );
    const beforeDisable = f.store.instance(s)!;
    f.store.save({ ...input, id: s, enabled: false });
    expect(f.store.publish(beforeDisable, { cards: [], nextRunAt: null })).toBe(
      false,
    );
    f.store.save({ ...input, id: s });
    const beforeSourceChange = f.store.instance(s)!;
    f.store.save({ ...sourceInput(), id: c, enabled: false });
    expect(
      f.store.publish(beforeSourceChange, { cards: [], nextRunAt: null }),
    ).toBe(false);
    expect(f.store.context(f.store.instance(s)!).inputs.items).toEqual([]);
  } finally {
    f.close();
  }
});

test("connection metadata and unchanged credentials preserve state; settings or credentials reset it", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("connection")]);
    f.main.saveProfile("profile-other", { name: "Other", color: "green" });
    const input = sourceInput(),
      id = f.store.save(input);
    const publish = () =>
      f.store.publish(f.store.instance(id)!, {
        datasets: { items: ["keep"] },
        state: { cursor: 7 },
      });
    publish();
    for (const change of [
      { name: "Renamed" },
      { profileId: "profile-other" },
      { enabled: false },
      { enabled: true },
      { secrets: { token: "x" } },
    ]) {
      f.store.save({ ...input, id, ...change });
      expect(JSON.parse(f.store.instance(id)!.state)).toEqual({ cursor: 7 });
      expect(JSON.parse(f.store.instance(id)!.snapshots).items.data).toEqual([
        "keep",
      ]);
    }
    f.store.save({ ...input, id, settings: { label: "changed source" } });
    expect(f.store.instance(id)!.state).toBe("null");
    expect(f.store.instance(id)!.snapshots).toBe("{}");
    publish();
    f.store.save({
      ...input,
      id,
      settings: { label: "changed source" },
      secrets: { token: "new" },
    });
    expect(f.store.instance(id)!.state).toBe("null");
  } finally {
    f.close();
  }
});

test("credential-incompatible upgrades fail atomically and never give migrations credentials", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("connection")]);
    const id = f.store.save(sourceInput());
    f.store.publish(f.store.instance(id)!, {
      datasets: { items: ["keep"] },
      state: { cursor: 9 },
    });
    const previous = f.store.instance(id)!;
    const upgrade = pkg("connection", "0.1.1");
    upgrade.manifest.secrets!.required = ["token", "account"];
    upgrade.manifest.secrets!.properties!.account = { type: "string" };
    const review = f.store.stage([upgrade], []);
    f.store.confirm(review.id);
    const op = f.store.pending()!;
    expect(() =>
      f.store.commitInstall(op, f.store.installInput(op).affected, {}),
    ).toThrow("credentials-incompatible");
    expect(f.store.instance(id)).toEqual(previous);
    expect(f.store.getPackage("test/connection").manifest.version).toBe(
      "0.1.0",
    );
    f.store.save({
      ...sourceInput(),
      id,
      secrets: { token: "x", account: "a" },
    });
    f.store.commitInstall(op, f.store.installInput(op).affected, {});
    expect(f.store.getPackage("test/connection").manifest.version).toBe(
      "0.1.1",
    );
    f.store.rollback();
    expect(f.store.context(f.store.instance(id)!).secrets).toEqual({
      token: "x",
      account: "a",
    });
  } finally {
    f.close();
  }
});

test("community definitions work across independent providers and consumers and stay pinned after removal", () => {
  const f = fixture();
  try {
    const a = pkg("connection"),
      b = pkg("connection"),
      consumer = pkg("scenario");
    a.manifest.format = b.manifest.format = consumer.manifest.format = 2;
    b.manifest.id = "other/source";
    b.manifest.provides!.items.schema = {
      items: { type: "string" },
      type: "array",
    };
    consumer.manifest.dependencies = [];
    consumer.manifest.contracts = [a.manifest.provides!.items];
    install(f.store, [a, b, consumer]);
    const ids = [a, b].map((p) => f.store.save(sourceInput(p.manifest.id)));
    ids.forEach((id, n) =>
      f.store.publish(f.store.instance(id)!, {
        datasets: { items: [`Source ${n}`] },
        state: { private: true },
      }),
    );
    const bindings = {
      items: ids.map((connectionId) => ({ connectionId, dataset: "items" })),
    };
    const s = f.store.save({ ...scenarioInput(ids[0]), bindings });
    const context = f.store.context(f.store.instance(s)!);
    expect(context.inputs.items.map((s) => s.data)).toEqual([
      ["Source 0"],
      ["Source 1"],
    ]);
    expect(context.secrets).toBeUndefined();
    expect(JSON.stringify(context.inputs)).not.toContain("private");
    const second = structuredClone(consumer);
    second.manifest.id = "other/cards";
    install(f.store, [second]);
    expect(
      f.store.save({
        ...scenarioInput(ids[0]),
        packageId: second.manifest.id,
        bindings,
      }),
    ).toBeString();
    const conflict = structuredClone(a);
    conflict.manifest.id = "third/source";
    conflict.manifest.provides!.items.schema = {
      type: "array",
      items: { type: "number" },
    };
    expect(() => install(f.store, [conflict])).toThrow(
      "contract-definition-conflict",
    );
    const incompatible = structuredClone(b);
    incompatible.manifest.version = "0.1.1";
    incompatible.manifest.provides!.items.version = "2.0.0";
    expect(() => install(f.store, [incompatible])).toThrow(
      "incompatible-connection",
    );
    const unknown = structuredClone(b);
    unknown.manifest.id = "third/source";
    unknown.manifest.provides!.items.version = "1.1.0";
    install(f.store, [unknown]);
    const c = f.store.save(sourceInput(unknown.manifest.id));
    expect(() => f.store.save(scenarioInput(c))).toThrow(
      "incompatible-connection",
    );
    for (const i of f.store.instances().filter((i) => i.kind === "scenario"))
      f.store.removeInstance(i.id);
    for (const i of f.store.instances()) f.store.removeInstance(i.id);
    for (const p of f.store.installed()) f.store.removePackage(p.id);
    expect(() => install(f.store, [conflict])).toThrow(
      "contract-definition-conflict",
    );
  } finally {
    f.close();
  }
});

test("manifests require consumer definitions and reject remote schemas and unsupported versions", () => {
  const p = pkg("scenario");
  delete p.manifest.contracts;
  expect(() => manifest(p.manifest)).toThrow(
    "missing-input-contract-definition",
  );
  p.manifest.contracts = [pkg("connection").manifest.provides!.items];
  expect(manifest(p.manifest)).toBe(p.manifest);
  p.manifest.contracts[0].schema = { $ref: "https://example.com/schema" };
  expect(() => manifest(p.manifest)).toThrow("unsupported-schema-keyword");
  p.manifest.contracts[0].schema = { type: "string" };
  p.manifest.contracts[0].version = "2.0.0";
  expect(() => manifest(p.manifest)).toThrow(
    "missing-input-contract-definition",
  );
});

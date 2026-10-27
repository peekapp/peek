import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { openStore } from "../packages/db/src";
import { openExtensions } from "../packages/extensions/src/store";
import {
  encode,
  decode,
  iconDataUrl,
  type ExtensionPackage,
} from "../packages/extensions/src/archive";
import { manifest } from "../packages/extensions/src/validation";
function pkg(
  kind: "scenario" | "connection",
  version = "0.1.0",
): ExtensionPackage {
  return {
    manifest: {
      format: 3,
      sdk: "^0.2.0",
      id: `test/${kind}`,
      version,
      kind,
      name: kind,
      description: "Test extension",
      author: "Tests",
      entry: "index.mjs",
      settings: { type: "object", properties: { label: { type: "string" } } },
      settingsUi: { blocks: [
        { id: "label", name: { en: "Label" }, description: { en: "Instance label." }, controls: [{ type: "input", field: "label" }] },
        ...(kind === "connection" ? [{ id: "credentials", name: { en: "Credentials" }, description: { en: "Access token." }, source: "secrets" as const, controls: [{ type: "secret" as const, field: "token" }] }] : []),
      ] },
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
    const count = () => f.store.status().instances.find((i) => i.id === s)!.cardCount;
    expect(count()).toBe(0);
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
    expect(count()).toBe(1);
    // Future and expired cards count too: this is generated output, not screen visibility.
    f.store.publish(f.store.instance(s)!, {
      cards: [
        { ...result.cards[0], id: "future", visibleFrom: now + 60000, expiresAt: now + 120000 },
        { ...result.cards[0], id: "expired", visibleFrom: now - 120000, expiresAt: now - 60000 },
      ],
      nextRunAt: null,
    });
    expect(count()).toBe(2);
    expect(f.store.status().instances.find((i) => i.id === c)!.cardCount).toBe(0);
    expect(() => f.store.publish(f.store.instance(s)!, { cards: [{ ...result.cards[0], title: "" }], nextRunAt: null })).toThrow();
    expect(count()).toBe(2);
    f.store.publish(f.store.instance(s)!, { cards: [], nextRunAt: null });
    expect(count()).toBe(0);

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

test("rollback keeps connections active", () => {
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
      expect(restored.enabled).toBe(1);
      expect(restored.next_run_at !== null).toBe(true);
      expect(f.store.due().some((i) => i.id === id)).toBe(true);
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
    f.store.save({ ...sourceInput(), id: c, settings: { label: "changed" } });
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
    upgrade.manifest.settingsUi.blocks[1].controls = [
      { type: "secret", field: "token", label: { en: "Token" } },
      { type: "secret", field: "account", label: { en: "Account" } },
    ];
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
    a.manifest.format = b.manifest.format = consumer.manifest.format = 3;
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

test("icon assets are optional, bounded UTF-8 and restricted to the declared path", () => {
  const p = pkg("connection");
  expect(iconDataUrl(decode(encode([p])).packages[0])).toBeNull();
  p.manifest.icon = "assets/icon.svg";
  expect(() => encode([p])).toThrow("missing-icon-asset");
  for (const path of [
    "../icon.svg",
    "https://example.com/icon.svg",
    "assets/other.svg",
    null,
  ]) {
    expect(() => manifest({ ...p.manifest, icon: path })).toThrow(
      "invalid-icon-path",
    );
  }
  p.files["assets/icon.svg"] =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>Иконка</title></svg>';
  expect(decode(encode([p])).packages[0]).toEqual(p);
  expect(Buffer.from(iconDataUrl(p)!.split(",")[1], "base64").toString()).toBe(
    p.files["assets/icon.svg"],
  );
  p.files["assets/icon.svg"] = "a".repeat(32 * 1024);
  expect(() => encode([p])).not.toThrow();
  p.files["assets/icon.svg"] = "я".repeat(16 * 1024 + 1);
  expect(() => encode([p])).toThrow("invalid-icon-asset");
  delete p.manifest.icon;
  expect(() => encode([p])).toThrow("invalid-icon-asset");
  delete p.files["assets/icon.svg"];
  p.files["assets/other.svg"] = "<svg/>";
  expect(() => encode([p])).toThrow("unsafe-package-file");
});

test("review, updates and rollback carry package icons without exposing files", () => {
  const f = fixture();
  try {
    const p = pkg("connection");
    p.manifest.icon = "assets/icon.svg";
    p.files["assets/icon.svg"] =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"/>';
    const oldIcon = iconDataUrl(p);
    const review = f.store.stage([p], [p.manifest.id]);
    expect(review.packages[0].iconDataUrl).toBe(oldIcon);
    expect(review.packages[0]).not.toHaveProperty("files");
    f.store.confirm(review.id);
    let op = f.store.pending()!;
    f.store.commitInstall(op, f.store.installInput(op).affected, {});
    expect(f.store.status().packages[0].iconDataUrl).toBe(oldIcon);
    p.manifest.version = "0.1.1";
    p.files["assets/icon.svg"] = p.files["assets/icon.svg"].replace(
      "32 32",
      "64 64",
    );
    const update = f.store.stage([p], [p.manifest.id]);
    expect(update.packages[0].iconDataUrl).not.toBe(oldIcon);
    expect(f.store.status().packages[0].iconDataUrl).toBe(oldIcon);
    f.store.confirm(update.id);
    op = f.store.pending()!;
    f.store.commitInstall(op, f.store.installInput(op).affected, {});
    expect(f.store.status().packages[0].iconDataUrl).toBe(iconDataUrl(p));
    expect(f.store.status().packages[0]).not.toHaveProperty("files");
    f.store.rollback();
    expect(f.store.status().packages[0].iconDataUrl).toBe(oldIcon);
  } finally {
    f.close();
  }
});

test("CLI check and pack include icons and reject missing, oversized and invalid UTF-8 assets", () => {
  const dir = mkdtempSync(join(tmpdir(), "peek-icon-cli-"));
  try {
    const p = pkg("connection");
    p.manifest.icon = "assets/icon.svg";
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "peek.json"), JSON.stringify(p.manifest));
    writeFileSync(join(dir, "index.ts"), "export default {};");
    const run = (command: string) =>
      Bun.spawnSync([
        process.execPath,
        "packages/cli/src/cli.ts",
        command,
        dir,
        join(dir, "icon.peek"),
      ]);
    expect(run("check").exitCode).not.toBe(0);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"/>';
    writeFileSync(join(dir, "assets/icon.svg"), svg);
    expect(run("check").exitCode).toBe(0);
    expect(run("pack").exitCode).toBe(0);
    expect(
      decode(readFileSync(join(dir, "icon.peek"))).packages[0].files[
        "assets/icon.svg"
      ],
    ).toBe(svg);
    writeFileSync(join(dir, "assets/icon.svg"), "x".repeat(32 * 1024 + 1));
    expect(run("check").exitCode).not.toBe(0);
    expect(run("pack").exitCode).not.toBe(0);
    writeFileSync(join(dir, "assets/icon.svg"), Buffer.from([0xff]));
    expect(run("check").exitCode).not.toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("iconColor is optional, preserves legacy package identity, and accepts only original or theme", () => {
  const p = pkg("connection");
  expect(decode(encode([p])).packages[0]).toEqual(p);
  expect(manifest(p.manifest)).not.toHaveProperty("iconColor");
  for (const color of ["original", "theme"] as const) {
    p.manifest.iconColor = color;
    expect(decode(encode([p])).packages[0].manifest.iconColor).toBe(color);
  }
  for (const color of [null, "auto", "", {}, 1, true]) {
    expect(() => manifest({ ...p.manifest, iconColor: color })).toThrow("invalid-icon-color");
  }
});


test("successful retries hide old failures without deleting history or exposing package payloads", () => {
  const f = fixture();
  try {
    const packages = [pkg("connection"), pkg("scenario")];
    const failed = f.store.stage(packages, ["test/scenario"]);
    f.store.confirm(failed.id);
    f.store.fail(failed.id, "execution-failed");
    const visible = () => f.store.status().operations.some((op) => op.id === failed.id);
    expect(visible()).toBe(true);
    const retry = f.store.stage(packages, ["test/scenario"]);
    f.store.confirm(retry.id);
    expect(visible()).toBe(true);
    const op = f.store.pending()!;
    f.store.commitInstall(op, [], {});
    expect(visible()).toBe(false);
    expect(f.store.status().operations.every((op) => op.payload === "{}")).toBe(true);
    const raw = new Database(f.path);
    try {
      expect(raw.query("SELECT status,error FROM extension_operations WHERE id=?").get(failed.id)).toEqual({ status: "failed", error: "execution-failed" });
    } finally { raw.close(); }
    // A newer failure remains visible, even after an older successful install.
    const newer = f.store.stage([pkg("connection", "0.1.1")], ["test/connection"]);
    f.store.confirm(newer.id);
    f.store.fail(newer.id, "migration-failed");
    expect(f.store.status().operations.some((op) => op.id === newer.id)).toBe(true);
  } finally { f.close(); }
});

test("unrelated and partial successes do not hide unresolved package failures", () => {
  const f = fixture();
  try {
    const packages = [pkg("connection"), pkg("scenario")];
    const failed = f.store.stage(packages, ["test/scenario"]);
    f.store.confirm(failed.id);
    f.store.fail(failed.id, "execution-failed");
    const visible = () => f.store.status().operations.some((op) => op.id === failed.id);
    const unrelated = pkg("connection");
    unrelated.manifest.id = "test/other";
    for (const p of [unrelated, packages[0], packages[1]]) {
      const review = f.store.stage([p], [p.manifest.id]);
      f.store.confirm(review.id);
      f.store.commitInstall(f.store.pending()!, [], {});
      expect(visible()).toBe(p.manifest.id !== "test/scenario");
    }
  } finally { f.close(); }
});

test("enable changes preserve current configuration and invalidate in-flight results", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("connection"), pkg("scenario")]);
    const connection = f.store.save(sourceInput());
    const id = f.store.save({ ...scenarioInput(connection), settings: { label: "latest" } });
    const before = f.store.instance(id)!;
    f.store.setEnabled(id, false);
    const disabled = f.store.instance(id)!;
    expect(disabled.enabled).toBe(0);
    expect(disabled.next_run_at).toBeNull();
    expect(disabled.settings).toBe(before.settings);
    expect(disabled.bindings).toBe(before.bindings);
    expect(disabled.name).toBe(before.name);
    expect(f.store.publish(before, { cards: [], nextRunAt: null })).toBe(false);
    f.store.setEnabled(id, true);
    expect(f.store.instance(id)!.enabled).toBe(1);
    expect(f.store.due().some((i) => i.id === id)).toBe(true);
    const secret = f.store.context(f.store.instance(connection)!).secrets;
    expect(() => f.store.setEnabled(connection, false)).toThrow("connection-always-active");
    f.store.save({ ...sourceInput(), id: connection, enabled: false });
    expect(f.store.instance(connection)!.enabled).toBe(1);
    expect(f.store.due().some((i) => i.id === connection)).toBe(true);
    expect(f.store.context(f.store.instance(connection)!).secrets).toEqual(secret);
    expect(() => f.store.setEnabled("missing", true)).toThrow("instance-not-found");
    expect(() => f.store.setEnabled(id, "false" as unknown as boolean)).toThrow("invalid-instance");
  } finally {
    f.close();
  }
});

test("migration reactivates connections without changing saved data or scenarios", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("connection"), pkg("scenario")]);
    const connection = f.store.save(sourceInput());
    const scenario = f.store.save({ ...scenarioInput(connection), enabled: false });
    const before = f.store.instance(connection)!;
    const db = new Database(f.path);
    db.run("UPDATE extension_instances SET enabled=0,next_run_at=NULL WHERE id=?", [connection]);
    db.exec("PRAGMA user_version = 12");
    db.close();
    f.main.migrate();
    const after = f.store.instance(connection)!;
    expect(after.enabled).toBe(1);
    expect(after.generation).toBe(before.generation + 1);
    expect(after.next_run_at).not.toBeNull();
    expect(after.secret).toBe(before.secret);
    expect(after.settings).toBe(before.settings);
    expect(after.snapshots).toBe(before.snapshots);
    expect(f.store.instance(scenario)!.enabled).toBe(0);
    f.main.migrate();
    expect(f.store.instance(connection)).toEqual(after);
  } finally { f.close(); }
});

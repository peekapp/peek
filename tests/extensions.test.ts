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
  kind: "scenario" | "integration",
  version = "0.1.0",
): ExtensionPackage {
  return {
    manifest: {
      format: 1,
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
      ...(kind === "integration"
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
            inputs: {
              items: {
                contract: "test/items",
                version: "^1.0.0",
                multiple: true,
              },
            },
            dependencies: [{ id: "test/integration", version: "^0.1.0" }],
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
  store.commitInstall(op, input.affected, {});
}
test("package archive rejects traversal, duplicate identities, corrupted data and scenario permissions", () => {
  const p = pkg("scenario");
  expect(decode(encode([p])).packages[0]).toEqual(p);
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
    install(f.store, [pkg("scenario"), pkg("integration")]);
    const c = f.store.save({
      packageId: "test/integration",
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
    expect(() => f.store.removePackage("test/integration")).toThrow(
      "package-in-use",
    );
    expect(() => f.store.removeInstance(c)).toThrow("connection-in-use");
    f.store.removeInstance(s);
    expect(f.store.instance(c)).not.toBeNull();
    f.store.removePackage("test/scenario");
    expect(() => f.store.removePackage("test/integration")).toThrow();
    f.store.removeInstance(c);
    f.store.removePackage("test/integration");
    expect(f.store.installed()).toHaveLength(0);
  } finally {
    f.close();
  }
});
test("publishing validates data, scopes cards and rejects stale and deleted results", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("integration")]);
    const c = f.store.save({
      packageId: "test/integration",
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
    expect(f.store.publish(stale, result)).toBe(false);
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
    install(f.store, [pkg("scenario"), pkg("integration")]);
    const c = f.store.save({
      packageId: "test/integration",
      name: "Source",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    const changed = pkg("integration");
    changed.files["index.mjs"] = "different";
    expect(() => f.store.stage([changed], [])).toThrow("immutable-version");
    const newer = pkg("integration", "0.1.1");
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
    expect(f.store.getPackage("test/integration").manifest.version).toBe(
      "0.1.0",
    );
    f.store.commitInstall(op, affected, {
      [c]: { settings: { label: "migrated" }, state: null },
    });
    expect(f.store.getPackage("test/integration").manifest.version).toBe(
      "0.1.1",
    );
    f.store.rollback();
    expect(f.store.getPackage("test/integration").manifest.version).toBe(
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
    const source = pkg("integration");
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
      cards: [{
        id: "one",
        title: "Keep",
        visibleFrom: now,
        targetAt: now + 60000,
        expiresAt: now + 60000,
      }],
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
    expect(f.store.getPackage(cards.manifest.id).manifest.version).toBe("0.1.0");
  } finally {
    f.close();
  }
});

test("changes after review and new instances during migration invalidate commit", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("integration")]);
    const preview = f.store.stage([pkg("integration", "0.1.1")], []);
    f.store.confirm(preview.id);
    const op = f.store.pending()!;
    const { affected } = f.store.installInput(op);
    f.store.save({
      packageId: "test/integration",
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
test("enabled persistent integrations recover after a runner restart", () => {
  const f = fixture();
  try {
    install(f.store, [pkg("scenario"), pkg("integration")]);
    const id = f.store.save({
      packageId: "test/integration",
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
    install(f.store, [pkg("scenario"), pkg("integration")]);
    const c = f.store.save({
      packageId: "test/integration",
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
      install(f.store, [pkg("integration")]);
      const input = {
        packageId: "test/integration",
        name: "Source",
        profileId: "shared",
        settings: {},
        secrets: { token: "x" },
        bindings: {},
        enabled,
      };
      const id = f.store.save(input);
      install(f.store, [pkg("integration", "0.1.1")]);
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
    install(f.store, [pkg("integration")]);
    const id = f.store.save({
      packageId: "test/integration",
      name: "Source",
      profileId: "shared",
      settings: {},
      secrets: { token: "x" },
      bindings: {},
      enabled: true,
    });
    const review = f.store.stage([pkg("integration", "0.1.1")], []);
    f.store.confirm(review.id);
    const op = f.store.pending()!;
    expect(() =>
      f.store.commitInstall(op, f.store.installInput(op).affected, {
        [id]: { settings: { label: "x".repeat(1024 * 1024) }, state: null },
      }),
    ).toThrow("payload-too-large");
    expect(f.store.getPackage("test/integration").manifest.version).toBe(
      "0.1.0",
    );
    expect(f.store.instance(id)!.settings).toBe("{}");
  } finally {
    f.close();
  }
});

import { acceptsContract } from "./compatibility";
import type { Card } from "@peek/core";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { type Json, type Manifest, type Snapshot } from "@peekapp/sdk";
import type { ScenarioResult } from "@peekapp/sdk/scenario";
import type { ConnectionUpdate } from "@peekapp/sdk/connection";
import { encryptSecret, decryptSecret } from "./secrets";
import { type ExtensionPackage, packageDigest, iconDataUrl } from "./archive";
import {
  compatible,
  validate,
  boundedJson,
  LIMITS,
  manifest,
  contractDefinitions,
  canonicalSchema,
} from "./validation";
export type Binding = { connectionId: string; dataset: string };
export type Instance = {
  id: string;
  package_id: string;
  kind: "scenario" | "connection";
  name: string;
  profile_id: string;
  settings: string;
  secret: string | null;
  bindings: string;
  enabled: number;
  generation: number;
  data_revision: number;
  state: string;
  next_run_at: number | null;
  last_success: number | null;
  last_error: string | null;
  snapshots: string;
};
export type Installed = {
  id: string;
  payload: string;
  explicit: number;
  installed_at: number;
};
export type Operation = {
  id: string;
  kind: string;
  status: string;
  payload: string;
  created_at: number;
  error: string | null;
};
export function openExtensions(path: string) {
  const db = new Database(path);
  db.exec("PRAGMA busy_timeout = 5000;");
  const installed = () =>
    db
      .query<Installed, []>("SELECT * FROM extension_packages ORDER BY id")
      .all();
  const officialDigests = new Map<string, string>();
  const receipts = () =>
    db
      .query<{ id: string; digest: string }, []>("SELECT id,digest FROM extension_defaults")
      .all();
  function refreshOfficialReceipts() {
    for (const p of installed()) {
      const digest = officialDigests.get(p.id);
      if (digest && packageDigest(JSON.parse(p.payload)) === digest)
        db.run("UPDATE extension_defaults SET digest=? WHERE id=? AND digest<>?", [
          digest, p.id, digest,
        ]);
    }
  }
  const instances = () =>
    db
      .query<Instance, []>("SELECT * FROM extension_instances ORDER BY name")
      .all();
  const instance = (id: string) =>
    db
      .query<
        Instance,
        [string]
      >("SELECT * FROM extension_instances WHERE id = ?")
      .get(id);
  const getPackage = (id: string) => {
    const row = db
      .query<
        Installed,
        [string]
      >("SELECT * FROM extension_packages WHERE id = ?")
      .get(id);
    if (!row) throw new Error("package-not-installed");
    return JSON.parse(row.payload) as ExtensionPackage;
  };
  function visibleOperations() {
    const resolved = new Set<string>();
    return db
      .query<Operation & { roots: string; packageIds: string }, []>(`
        SELECT id,kind,status,'{}' AS payload,created_at,error,
          json_extract(payload,'$.roots') AS roots,
          (SELECT json_group_array(json_extract(value,'$.manifest.id'))
           FROM json_each(extension_operations.payload,'$.packages')) AS packageIds
        FROM extension_operations ORDER BY created_at DESC,rowid DESC LIMIT 20
      `)
      .all()
      .filter((op) => {
        if (op.status !== "complete" && op.status !== "failed") return true;
        const ids: string[] = [...JSON.parse(op.roots), ...JSON.parse(op.packageIds)];
        if (op.status === "complete") {
          for (const id of ids) resolved.add(id);
          return true;
        }
        return !ids.length || !ids.every((id) => resolved.has(id));
      })
      .map(({ roots, packageIds, ...op }) => op);
  }
  function revision() {
    db.run("UPDATE screen_state SET revision = revision + 1 WHERE id = 1");
  }
  function owner(id: string) {
    const p = db
      .query<
        { id: string; name: string; color: string; system: number },
        [string]
      >("SELECT * FROM profiles WHERE id = ?")
      .get(id);
    if (!p) throw new Error("invalid-profile");
    return {
      profileId: p.id,
      name: p.name,
      color: p.color,
      system: !!p.system,
    };
  }
  function allConnections(): {
    id: string;
    name: string;
    enabled: boolean;
    contracts: Record<string, { id: string; version: string }>;
  }[] {
    return instances()
      .filter((i) => i.kind === "connection")
      .map((i) => ({
        id: i.id,
        name: i.name,
        enabled: !!i.enabled,
        contracts: getPackage(i.package_id).manifest.provides ?? {},
      }));
  }
  function validateBindings(m: Manifest, bindings: Record<string, Binding[]>, enabled = true) {
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings))
      throw new Error("invalid-bindings");
    const connections = allConnections();
    if (Object.keys(bindings).some((k) => !Object.hasOwn(m.inputs ?? {}, k)))
      throw new Error("unknown-input");
    for (const [name, input] of Object.entries(m.inputs ?? {})) {
      const selected = bindings[name] ?? [];
      if (
        !Array.isArray(selected) ||
        selected.length > 100 ||
        (enabled && !input.optional && !selected.length) ||
        (!input.multiple && selected.length > 1)
      )
        throw new Error("invalid-bindings");
      const seen = new Set<string>();
      for (const b of selected) {
        if (
          !b ||
          typeof b.connectionId !== "string" ||
          typeof b.dataset !== "string"
        )
          throw new Error("invalid-bindings");
        const key = JSON.stringify([b.connectionId, b.dataset]);
        if (seen.has(key)) throw new Error("duplicate-binding");
        seen.add(key);
        const c = connections.find((c) => c.id === b.connectionId)?.contracts[
          b.dataset
        ];
        if (!c || !acceptsContract(m, input, c))
          throw new Error("incompatible-connection");
      }
    }
  }
  function checkContracts(packages: ExtensionPackage[], persist = false) {
    const definitions = new Map<string, string>();
    for (const row of db
      .query<
        { id: string; version: string; schema: string },
        []
      >("SELECT * FROM extension_contracts")
      .all())
      definitions.set(`${row.id}@${row.version}`, row.schema);
    for (const p of packages) {
      manifest(p.manifest);
      iconDataUrl(p);
      for (const c of contractDefinitions(p.manifest)) {
        const key = `${c.id}@${c.version}`,
          schema = canonicalSchema(c.schema);
        if (definitions.has(key) && definitions.get(key) !== schema)
          throw new Error(`contract-definition-conflict: ${key}`);
        definitions.set(key, schema);
        if (persist)
          db.run("INSERT OR IGNORE INTO extension_contracts VALUES (?,?,?)", [
            c.id,
            c.version,
            schema,
          ]);
      }
    }
  }
  function validateSet(packages: ExtensionPackage[]) {
    checkContracts(packages);
    const selected = new Map(packages.map((p) => [p.manifest.id, p]));
    for (const p of packages)
      for (const d of p.manifest.dependencies ?? []) {
        const dep = selected.get(d.id);
        if (!dep || !compatible(dep.manifest.version, d.version))
          throw new Error(
            `dependency-conflict: ${p.manifest.id} requires ${d.id} ${d.version}`,
          );
      }
    const active = new Set<string>(),
      done = new Set<string>();
    function visit(id: string) {
      if (active.has(id)) throw new Error("dependency-cycle");
      if (done.has(id)) return;
      active.add(id);
      for (const d of selected.get(id)!.manifest.dependencies ?? [])
        visit(d.id);
      active.delete(id);
      done.add(id);
    }
    for (const id of selected.keys()) visit(id);
  }
  function stage(packages: ExtensionPackage[], roots: string[]) {
    const selected = new Map(
      installed().map((r) => [r.id, JSON.parse(r.payload) as ExtensionPackage]),
    );
    for (const p of packages) {
      const old = selected.get(p.manifest.id);
      if (old && old.manifest.kind !== p.manifest.kind)
        throw new Error("package-kind-changed");
      if (
        old &&
        old.manifest.version === p.manifest.version &&
        packageDigest(old) !== packageDigest(p)
      )
        throw new Error("immutable-version");
      selected.set(p.manifest.id, p);
    }
    validateSet([...selected.values()]);
    db.run(
      "DELETE FROM extension_operations WHERE (status='review' AND created_at < ?) OR (status IN ('complete','failed') AND created_at < ?)",
      [Date.now() - 3600000, Date.now() - 7 * 86400000],
    );
    const count = db
      .query<
        { n: number },
        []
      >("SELECT COUNT(*) n FROM extension_operations WHERE status IN ('review','pending')")
      .get()!.n;
    if (count >= 10) throw new Error("too-many-pending-installations");
    const id = randomUUID();
    db.run(
      "INSERT INTO extension_operations VALUES (?, 'install', 'review', ?, ?, NULL)",
      [
        id,
        JSON.stringify({
          packages: packages.filter((p) => {
            const previous = installed().find(
              (row) => row.id === p.manifest.id,
            );
            return (
              !previous ||
              packageDigest(JSON.parse(previous.payload)) !== packageDigest(p)
            );
          }),
          roots,
          base: installed().map((r) => [
            r.id,
            packageDigest(JSON.parse(r.payload)),
          ]),
        }),
        Date.now(),
      ],
    );
    return {
      id,
      packages: packages.map((p) => ({
        manifest: p.manifest,
        iconDataUrl: iconDataUrl(p),
        sha256: packageDigest(p),
        status: "unverified",
      })),
    };
  }
  return {
    close: () => db.close(),
    installed,
    instances,
    instance,
    getPackage,
    connections: allConnections,
    stage,
    provision(packages: ExtensionPackage[]) {
      // Only the host's bundled packages establish trust, never an upload's metadata.
      officialDigests.clear();
      for (const p of packages)
        officialDigests.set(p.manifest.id, packageDigest(p));
      // Bundled defaults enter the same installation journal as uploaded packages.
      // A receipt prevents reinstalling a package the user later removes.
      return db
        .transaction(() => {
          refreshOfficialReceipts();
          const fresh = packages.filter(
            (p) =>
              !db
                .query("SELECT id FROM extension_defaults WHERE id=?")
                .get(p.manifest.id),
          );
          if (
            !fresh.length ||
            db
              .query(
                "SELECT id FROM extension_operations WHERE status='pending'",
              )
              .get()
          )
            return;
          const missing = fresh.filter(
            (p) => !installed().some((row) => row.id === p.manifest.id),
          );
          if (missing.length) {
            const op = stage(
              missing,
              missing.map((p) => p.manifest.id),
            );
            db.run(
              "UPDATE extension_operations SET status='pending' WHERE id=?",
              [op.id],
            );
          }
          for (const p of fresh)
            db.run("INSERT INTO extension_defaults VALUES (?, ?)", [
              p.manifest.id,
              packageDigest(p),
            ]);
        })
        .immediate();
    },
    recover() {
      db.run(
        "UPDATE extension_instances SET generation=generation+1,next_run_at=? WHERE kind='connection' AND enabled=1",
        [Date.now()],
      );
    },
    scenarioCards(id: string): Card[] {
      if (!db.query("SELECT id FROM extension_instances WHERE id=? AND kind='scenario'").get(id))
        throw new Error("scenario-not-found");
      return db.query<{ payload: string }, [string]>("SELECT payload FROM cards WHERE scenario_id=?")
        .all(id).map((row) => JSON.parse(row.payload) as Card)
        .sort((a, b) => a.targetAt - b.targetAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    status() {
      const cardCounts = new Map(
        db.query<{ scenario_id: string; count: number }, []>(
          "SELECT scenario_id, COUNT(*) AS count FROM cards WHERE scenario_id IS NOT NULL GROUP BY scenario_id",
        ).all().map((row) => [row.scenario_id, row.count]),
      );
      const runtime = db
        .query<
          { heartbeat: number; error: string | null },
          []
        >("SELECT * FROM extension_runtime WHERE id=1")
        .get();
      return {
        packages: installed().map((r) => ({
          manifest: JSON.parse(r.payload).manifest,
          iconDataUrl: iconDataUrl(JSON.parse(r.payload)),
          explicit: !!r.explicit,
          official:
            (
              db
                .query("SELECT digest FROM extension_defaults WHERE id=?")
                .get(r.id) as { digest: string } | null
            )?.digest === packageDigest(JSON.parse(r.payload)),
          sha256: packageDigest(JSON.parse(r.payload)),
          unused:
            !instances().some((i) => i.package_id === r.id) &&
            !installed().some((p) =>
              (JSON.parse(p.payload).manifest.dependencies ?? []).some(
                (d: { id: string }) => d.id === r.id,
              ),
            ),
        })),
        instances: instances().map(({ secret, state, snapshots, ...i }) => ({
          ...i,
          hasSecret: !!secret,
          cardCount: cardCounts.get(i.id) ?? 0,
          settings: JSON.parse(i.settings),
          bindings: JSON.parse(i.bindings),
        })),
        connections: allConnections(),
        operations: visibleOperations(),
        runtime: {
          ready:
            !!runtime &&
            Date.now() - runtime.heartbeat < 30000 &&
            !runtime.error,
          error: runtime?.error ?? null,
        },
        canRollback: !!db
          .query("SELECT id FROM extension_history WHERE id=1")
          .get(),
      };
    },
    cancel(id: string) {
      db.run(
        "DELETE FROM extension_operations WHERE id=? AND status='review'",
        [id],
      );
    },
    confirm(id: string) {
      const result = db.run(
        "UPDATE extension_operations SET status='pending' WHERE id=? AND status='review'",
        [id],
      );
      if (!result.changes) throw new Error("invalid-operation");
    },
    pending() {
      return db
        .query<
          Operation,
          []
        >("SELECT * FROM extension_operations WHERE status='pending' ORDER BY created_at LIMIT 1")
        .get();
    },
    fail(id: string, error: string) {
      db.run(
        "UPDATE extension_operations SET status='failed',error=? WHERE id=?",
        [error.slice(0, 500), id],
      );
    },
    heartbeat(error: string | null) {
      db.run(
        "INSERT INTO extension_runtime VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat,error=excluded.error",
        [Date.now(), error],
      );
    },
    installInput(op: Operation) {
      const payload = JSON.parse(op.payload) as {
        packages: ExtensionPackage[];
        roots: string[];
        base: unknown;
      };
      if (
        JSON.stringify(payload.base) !==
        JSON.stringify(
          installed().map((r) => [r.id, packageDigest(JSON.parse(r.payload))]),
        )
      )
        throw new Error("installation-changed-review-again");
      const affected = instances().filter((i) =>
        payload.packages.some((p) => p.manifest.id === i.package_id),
      );
      return { ...payload, affected };
    },
    commitInstall(
      op: Operation,
      affected: Instance[],
      migrated: Record<string, { settings: Json; state: Json }>,
    ) {
      db.transaction(() => {
        const payload = JSON.parse(op.payload) as {
          packages: ExtensionPackage[];
          roots: string[];
          base: unknown;
        };
        if (
          JSON.stringify(payload.base) !==
          JSON.stringify(
            installed().map((r) => [
              r.id,
              packageDigest(JSON.parse(r.payload)),
            ]),
          )
        )
          throw new Error("installation-changed-review-again");
        const currentAffected = instances().filter((i) =>
          payload.packages.some((p) => p.manifest.id === i.package_id),
        );
        if (currentAffected.length !== affected.length)
          throw new Error("instance-changed-retry-install");
        for (const i of affected)
          if (instance(i.id)?.generation !== i.generation)
            throw new Error("instance-changed-retry-install");
        if (!payload.packages.length) {
          for (const id of payload.roots)
            db.run("UPDATE extension_packages SET explicit=1 WHERE id=?", [id]);
          db.run(
            "UPDATE extension_operations SET status='complete' WHERE id=?",
            [op.id],
          );
          return;
        }
        checkContracts(
          [
            ...installed()
              .filter(
                (r) => !payload.packages.some((p) => p.manifest.id === r.id),
              )
              .map((r) => JSON.parse(r.payload)),
            ...payload.packages,
          ],
          true,
        );
        // Only one coherent rollback point; ciphertext stays on the server.
        db.run("INSERT OR REPLACE INTO extension_history VALUES (1,?)", [
          JSON.stringify({
            packages: installed(),
            instances: instances(),
            receipts: receipts(),
          }),
        ]);
        for (const p of payload.packages) {
          for (const i of affected.filter(
            (i) => i.package_id === p.manifest.id,
          )) {
            const next = migrated[i.id] ?? {
              settings: JSON.parse(i.settings),
              state: JSON.parse(i.state),
            };
            if (p.manifest.secrets) {
              try {
                validate(
                  p.manifest.secrets,
                  i.secret ? JSON.parse(decryptSecret(i.secret, path)) : {},
                );
              } catch {
                throw new Error(
                  `credentials-incompatible: ${i.name}; update saved credentials before upgrading ${p.manifest.id}`,
                );
              }
            }
            validate(p.manifest.settings, next.settings);
            boundedJson(next.settings, LIMITS.state);
            boundedJson(next.state, LIMITS.state);
            db.run(
              "UPDATE extension_instances SET settings=?,state=?,generation=generation+1,next_run_at=?,snapshots='{}' WHERE id=?",
              [
                JSON.stringify(next.settings),
                JSON.stringify(next.state),
                i.enabled ? Date.now() : null,
                i.id,
              ],
            );
            db.run("DELETE FROM cards WHERE scenario_id=?", [i.id]);
          }
          db.run(
            "INSERT INTO extension_packages VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,explicit=MAX(extension_packages.explicit,excluded.explicit),installed_at=excluded.installed_at",
            [
              p.manifest.id,
              JSON.stringify(p),
              payload.roots.includes(p.manifest.id) ? 1 : 0,
              Date.now(),
            ],
          );
        }
        refreshOfficialReceipts();
        for (const id of payload.roots)
          db.run("UPDATE extension_packages SET explicit=1 WHERE id=?", [id]);
        for (const i of instances().filter((i) => i.kind === "scenario"))
          validateBindings(
            getPackage(i.package_id).manifest,
            JSON.parse(i.bindings),
            !!i.enabled,
          );
        db.run(
          "UPDATE extension_instances SET generation=generation+1,next_run_at=? WHERE kind='scenario' AND enabled=1",
          [Date.now()],
        );
        db.run("UPDATE extension_operations SET status='complete' WHERE id=?", [
          op.id,
        ]);
        revision();
      }).immediate();
    },
    rollback() {
      db.transaction(() => {
        const row = db
          .query<
            { payload: string },
            []
          >("SELECT payload FROM extension_history WHERE id=1")
          .get();
        if (!row) throw new Error("no-rollback");
        const old = JSON.parse(row.payload) as {
          packages: Installed[];
          instances: Instance[];
          receipts?: { id: string; digest: string }[];
        };
        // Restoring an installation is explicit and includes its configuration/state snapshot.
        if (instances().some((i) => !old.instances.some((x) => x.id === i.id)))
          throw new Error("remove-new-instances-before-rollback");
        checkContracts(
          old.packages.map((p) => JSON.parse(p.payload)),
          true,
        );
        db.run("DELETE FROM extension_packages");
        for (const p of old.packages)
          db.run("INSERT INTO extension_packages VALUES (?,?,?,?)", [
            p.id,
            p.payload,
            p.explicit,
            p.installed_at,
          ]);
        db.run(
          "DELETE FROM cards WHERE scenario_id IN (SELECT id FROM extension_instances)",
        );
        for (const i of old.instances) {
          const current = instance(i.id);
          if (!current) continue;
          db.run(
            "UPDATE extension_instances SET settings=?,state=?,secret=?,bindings=?,snapshots=?,generation=?,next_run_at=?,last_error=NULL WHERE id=?",
            [
              i.settings,
              i.state,
              i.secret,
              i.bindings,
              i.snapshots,
              current.generation + 1,
              current.enabled ? Date.now() : null,
              i.id,
            ],
          );
        }
        for (const i of instances()) {
          owner(i.profile_id);
          validateBindings(
            getPackage(i.package_id).manifest,
            JSON.parse(i.bindings),
            !!i.enabled,
          );
        }
        for (const receipt of old.receipts ?? [])
          db.run("UPDATE extension_defaults SET digest=? WHERE id=?", [
            receipt.digest, receipt.id,
          ]);
        db.run("DELETE FROM extension_history");
        revision();
      }).immediate();
    },
    save(input: {
      id?: string;
      packageId: string;
      name: string;
      profileId: string;
      settings: Json;
      secrets?: Record<string, Json>;
      bindings: Record<string, Binding[]>;
      enabled: boolean;
    }, restoringBindings = false) {
      return db
        .transaction(() => {
          const p = getPackage(input.packageId),
            old = input.id ? instance(input.id) : null;
          if (input.id && !old) throw new Error("instance-not-found");
          if (old && old.package_id !== input.packageId)
            throw new Error("cannot-change-package");
          if (
            typeof input.name !== "string" ||
            !input.name.trim() ||
            input.name.length > 100 ||
            typeof input.enabled !== "boolean"
          )
            throw new Error("invalid-instance");
          owner(input.profileId);
          validate(p.manifest.settings, input.settings, "settings");
          boundedJson(input.settings, LIMITS.state);
          validateBindings(p.manifest, input.bindings ?? {}, input.enabled);
          const previousBindings: Record<string, Binding[]> = old ? JSON.parse(old.bindings) : {};
          for (const [name, bindings] of Object.entries(input.bindings ?? {}))
            for (const binding of bindings)
              if (!restoringBindings && !instance(binding.connectionId)?.enabled && !previousBindings[name]?.some(
                (previous) => previous.connectionId === binding.connectionId && previous.dataset === binding.dataset,
              )) throw new Error("connection-paused");
          const secrets =
            input.secrets ??
            (old?.secret ? JSON.parse(decryptSecret(old.secret, path)) : {});
          if (p.manifest.secrets) validate(p.manifest.secrets, secrets, "secrets");
          boundedJson(secrets, LIMITS.state);
          if (p.manifest.kind === "scenario" && Object.keys(secrets).length)
            throw new Error("scenario-secrets-forbidden");
          if (Object.keys(secrets).length) {
            const encrypted = instances().find((i) => i.secret)?.secret;
            if (encrypted) decryptSecret(encrypted, path);
          }
          const configChanged =
            !!old &&
            (canonicalSchema(JSON.parse(old.settings)) !==
              canonicalSchema(input.settings) ||
              canonicalSchema(
                old.secret ? JSON.parse(decryptSecret(old.secret, path)) : {},
              ) !== canonicalSchema(secrets));
          const enabled = input.enabled;
          const id = old?.id ?? `ext-${randomUUID()}`;
          db.run(
            `INSERT INTO extension_instances (id,package_id,kind,name,profile_id,settings,secret,bindings,enabled,generation,state,next_run_at,last_success,last_error,snapshots) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,NULL,NULL,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,profile_id=excluded.profile_id,settings=excluded.settings,secret=excluded.secret,bindings=excluded.bindings,enabled=excluded.enabled,generation=excluded.generation,next_run_at=excluded.next_run_at,last_error=NULL,state=excluded.state,snapshots=excluded.snapshots`,
            [
              id,
              input.packageId,
              p.manifest.kind,
              input.name.trim(),
              input.profileId,
              JSON.stringify(input.settings),
              Object.keys(secrets).length
                ? encryptSecret(JSON.stringify(secrets), path)
                : null,
              JSON.stringify(input.bindings ?? {}),
              enabled ? 1 : 0,
              (old?.generation ?? 0) + 1,
              p.manifest.kind === "connection" && configChanged
                ? "null"
                : (old?.state ?? "null"),
              enabled ? Date.now() : null,
              configChanged ? "{}" : (old?.snapshots ?? "{}"),
            ],
          );
          db.run("DELETE FROM cards WHERE scenario_id=?", [id]);
          if (p.manifest.kind === "connection" && (!old || configChanged))
            for (const dependent of instances().filter(
              (x) => x.kind === "scenario",
            ))
              if (
                Object.values(
                  JSON.parse(dependent.bindings) as Record<string, Binding[]>,
                )
                  .flat()
                  .some((b) => b.connectionId === id)
              ) {
                db.run("DELETE FROM cards WHERE scenario_id=?", [dependent.id]);
                db.run(
                  "UPDATE extension_instances SET generation=generation+1,next_run_at=CASE WHEN enabled=1 THEN ? ELSE NULL END WHERE id=?",
                  [Date.now(), dependent.id],
                );
              }
          revision();
          return id;
        })
        .immediate();
    },
    disconnect(id: string, connectionId: string, disable = false) {
      if (typeof id !== "string" || typeof connectionId !== "string" || typeof disable !== "boolean")
        throw new Error("invalid-instance");
      return db.transaction(() => {
        const current = instance(id);
        if (current?.kind !== "scenario" || instance(connectionId)?.kind !== "connection")
          throw new Error("instance-not-found");
        const bindings = Object.fromEntries(Object.entries(JSON.parse(current.bindings) as Record<string, Binding[]>)
          .map(([input, values]) => [input, values.filter((binding) => binding.connectionId !== connectionId)]));
        const manifest = getPackage(current.package_id).manifest;
        if (current.enabled && !disable && Object.entries(manifest.inputs ?? {}).some(([input, requirement]) => !requirement.optional && !bindings[input]?.length))
          throw new Error("connection-required");
        this.save({
          id, packageId: current.package_id, name: current.name, profileId: current.profile_id,
          settings: JSON.parse(current.settings), enabled: disable ? false : !!current.enabled, bindings,
        });
        return encryptSecret(JSON.stringify({ id, generation: instance(id)!.generation, bindings: JSON.parse(current.bindings), enabled: !!current.enabled }), path);
      }).immediate();
    },
    undoDisconnect(token: string) {
      if (typeof token !== "string") throw new Error("invalid-instance");
      const undo = JSON.parse(decryptSecret(token, path)) as { id: string; generation: number; bindings: Record<string, Binding[]>; enabled: boolean };
      if (!undo || typeof undo.id !== "string" || !Number.isSafeInteger(undo.generation))
        throw new Error("invalid-instance");
      return db.transaction(() => {
        const current = instance(undo.id);
        if (current?.kind !== "scenario") throw new Error("instance-not-found");
        if (current.generation !== undo.generation) throw new Error("scenario-changed");
        return this.save({
          id: current.id, packageId: current.package_id, name: current.name, profileId: current.profile_id,
          settings: JSON.parse(current.settings), bindings: undo.bindings, enabled: undo.enabled,
        }, true);
      }).immediate();
    },
    setEnabled(id: string, enabled: boolean) {
      if (typeof id !== "string" || typeof enabled !== "boolean")
        throw new Error("invalid-instance");
      return db.transaction(() => {
        const current = instance(id);
        if (!current) throw new Error("instance-not-found");
        return this.save({
          id, enabled,
          packageId: current.package_id,
          name: current.name,
          profileId: current.profile_id,
          settings: JSON.parse(current.settings),
          bindings: JSON.parse(current.bindings),
        });
      }).immediate();
    },
    requestRun(id: string) {
      const result = db.run(
        "UPDATE extension_instances SET generation=generation+1,next_run_at=?,last_error=NULL WHERE id=? AND enabled=1",
        [Date.now(), id],
      );
      if (!result.changes) throw new Error("instance-not-found-or-disabled");
    },
    removeInstance(id: string) {
      db.transaction(() => {
        if (
          instances().some((i) =>
            Object.values(JSON.parse(i.bindings) as Record<string, Binding[]>)
              .flat()
              .some((b) => b.connectionId === id),
          )
        )
          throw new Error("connection-in-use");
        db.run("DELETE FROM cards WHERE scenario_id=?", [id]);
        db.run("DELETE FROM extension_instances WHERE id=?", [id]);
        db.run("DELETE FROM extension_history");
        revision();
      }).immediate();
    },
    removePackage(id: string) {
      db.transaction(() => {
        if (
          instances().some((i) => i.package_id === id) ||
          installed().some((p) =>
            (JSON.parse(p.payload).manifest.dependencies ?? []).some(
              (d: { id: string }) => d.id === id,
            ),
          )
        )
          throw new Error("package-in-use");
        db.run("DELETE FROM extension_packages WHERE id=?", [id]);
        db.run("DELETE FROM extension_history");
      }).immediate();
    },
    context(i: Instance) {
      let inputBytes =
        Buffer.byteLength(i.settings) + Buffer.byteLength(i.state);
      const inputs: Record<string, Snapshot[]> = {};
      for (const [name, bindings] of Object.entries(
        JSON.parse(i.bindings) as Record<string, Binding[]>,
      ))
        inputs[name] = bindings.flatMap((b) => {
          const c = instance(b.connectionId);
          if (c) {
            inputBytes += Buffer.byteLength(c.snapshots);
            if (inputBytes > LIMITS.message)
              throw new Error("inputs-too-large");
            const snap = JSON.parse(c.snapshots)[b.dataset];
            return snap ? [{ connectionId: c.id, ...snap }] : [];
          }
          return [];
        });
      return {
        settings: JSON.parse(i.settings),
        state: JSON.parse(i.state),
        now: Date.now(),
        inputs,
        ...(i.kind === "connection"
          ? {
              secrets: i.secret
                ? JSON.parse(decryptSecret(i.secret, path))
                : {},
            }
          : {}),
      };
    },
    due(now = Date.now()) {
      return db
        .query<
          Instance,
          [number]
        >("SELECT * FROM extension_instances WHERE enabled=1 AND next_run_at<=? ORDER BY next_run_at")
        .all(now);
    },
    executionStatus(id: string) {
      return db
        .query<
          { enabled: number; generation: number },
          [string]
        >("SELECT enabled,generation FROM extension_instances WHERE id=?")
        .get(id);
    },
    retry(i: Instance, error: string) {
      db.run(
        "UPDATE extension_instances SET last_error=?,next_run_at=? WHERE id=? AND generation=?",
        [error, Date.now() + 60000, i.id, i.generation],
      );
    },
    publish(i: Instance, result: ScenarioResult | ConnectionUpdate) {
      return db
        .transaction(() => {
          const current = instance(i.id);
          if (
            !current ||
            current.generation !== i.generation ||
            !current.enabled
          )
            return false;
          const p = getPackage(i.package_id),
            now = Date.now();
          boundedJson(result, LIMITS.message);
          const stateValue =
            result.state === undefined
              ? current.state
              : boundedJson(result.state, LIMITS.state);
          let next = result.nextRunAt ?? null;
          if (
            next !== null &&
            (!Number.isSafeInteger(next) ||
              next < 0 ||
              next > 8_640_000_000_000_000)
          )
            throw new Error("invalid-next-run");
          if (next !== null) next = Math.max(next, now + 1000);
          if (i.kind === "connection") {
            const data = (result as ConnectionUpdate).datasets;
            if (!data || typeof data !== "object" || Array.isArray(data))
              throw new Error("invalid-datasets");
            const snapshots: Record<string, unknown> = {};
            for (const [name, contract] of Object.entries(
              p.manifest.provides ?? {},
            )) {
              if (!Object.hasOwn(data, name))
                throw new Error("missing-dataset");
              const pinned = db
                .query<
                  { schema: string },
                  [string, string]
                >("SELECT schema FROM extension_contracts WHERE id=? AND version=?")
                .get(contract.id, contract.version);
              if (!pinned || pinned.schema !== canonicalSchema(contract.schema))
                throw new Error(
                  `contract-definition-conflict: ${contract.id}@${contract.version}`,
                );
              validate(JSON.parse(pinned.schema), data[name]);
              snapshots[name] = {
                contract: contract.id,
                version: contract.version,
                updatedAt: now,
                data: data[name],
              };
            }
            if (
              Object.keys(data).some(
                (k) => !Object.hasOwn(p.manifest.provides ?? {}, k),
              )
            )
              throw new Error("unknown-dataset");
            db.run("UPDATE extension_instances SET snapshots=? WHERE id=?", [
              JSON.stringify(snapshots),
              i.id,
            ]);
            for (const dependent of instances().filter(
              (x) => x.kind === "scenario" && x.enabled,
            ))
              if (
                Object.values(
                  JSON.parse(dependent.bindings) as Record<string, Binding[]>,
                )
                  .flat()
                  .some((b) => b.connectionId === i.id)
              )
                db.run(
                  "UPDATE extension_instances SET data_revision=data_revision+1,next_run_at=? WHERE id=?",
                  [now, dependent.id],
                );
          } else {
            const cards = (result as ScenarioResult).cards;
            if (!Array.isArray(cards) || cards.length > LIMITS.cards)
              throw new Error("invalid-cards");
            const ids = new Set<string>();
            const who = owner(current.profile_id);
            db.run("DELETE FROM cards WHERE scenario_id=?", [i.id]);
            for (const card of cards) {
              if (
                typeof card.id !== "string" ||
                !card.id ||
                card.id.length > 200 ||
                ids.has(card.id) ||
                typeof card.title !== "string" ||
                !card.title.trim() ||
                card.title.length > 1000 ||
                ![card.targetAt, card.visibleFrom, card.expiresAt].every(
                  (n) =>
                    Number.isSafeInteger(n) &&
                    Math.abs(n) <= 8_640_000_000_000_000,
                ) ||
                card.expiresAt <= card.visibleFrom ||
                !["info", "meeting", "deadline"].includes(card.kind ?? "info")
              )
                throw new Error("invalid-card");
              for (const text of [card.body, card.location])
                if (
                  text !== undefined &&
                  (typeof text !== "string" || text.length > 4000)
                )
                  throw new Error("invalid-card");
              for (const n of [
                card.priority ?? 1,
                card.urgentPriority ?? card.priority ?? 1,
              ])
                if (!Number.isInteger(n) || n < 0 || n > 100)
                  throw new Error("invalid-priority");
              if (
                card.urgentAt !== undefined &&
                !Number.isSafeInteger(card.urgentAt)
              )
                throw new Error("invalid-card");
              ids.add(card.id);
              const id = `${i.id}:${card.id}`;
              const payload = {
                id,
                kind: card.kind ?? "info",
                title: card.title,
                body: card.body,
                location: card.location,
                targetAt: card.targetAt,
                visibleFrom: card.visibleFrom,
                expiresAt: card.expiresAt,
                urgentAt: card.urgentAt ?? card.targetAt,
                priority: card.priority ?? 1,
                urgentPriority: card.urgentPriority ?? card.priority ?? 1,
                owner: who,
              };
              db.run(
                "INSERT INTO cards(id,payload,expires_at,scenario_id) VALUES (?,?,?,?)",
                [id, JSON.stringify(payload), card.expiresAt, i.id],
              );
            }
          }
          if (
            i.kind === "scenario" &&
            current.data_revision !== i.data_revision
          )
            next = now;
          db.run(
            "UPDATE extension_instances SET state=?,next_run_at=?,last_success=?,last_error=NULL WHERE id=?",
            [stateValue, next, now, i.id],
          );
          revision();
          return true;
        })
        .immediate();
    },
  };
}
export type ExtensionStore = ReturnType<typeof openExtensions>;

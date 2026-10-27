import { expect, test } from "bun:test";
import { readiness, runContainer } from "../apps/extension-runner/src/docker";
import type { ExtensionPackage } from "../packages/extensions/src/archive";
const check = process.env.PEEK_TEST_DOCKER === "1" ? test : test.skip;
function pkg(code: string, connection = false): ExtensionPackage {
  return {
    manifest: {
      format: 3,
      sdk: "^0.2.0",
      id: "test/isolation",
      version: "0.1.0",
      kind: connection ? "connection" : "scenario",
      name: "Isolation",
      description: "Test",
      author: "Tests",
      entry: "index.mjs",
      icon: "assets/icon.svg",
      settings: { type: "object" },
      settingsUi: { blocks: [] },
      permissions: connection ? { internet: true } : {},
    },
    files: {
      "index.mjs": code,
      "assets/icon.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"/>',
    },
  };
}
check(
  "Docker: failed one-shot runs never replace the previous result",
  async () => {
    for (const ending of [
      "process.exit(1);",
      "process.stdout.write('garbage'); process.exit(0);",
      "process.stdout.write(line); process.exit(0);",
      "setInterval(() => {}, 1000); await new Promise(() => {});",
    ]) {
      const previous = { cards: [{ title: "Keep existing cards" }] };
      let saved: unknown = previous;
      const run = await runContainer(
        pkg(`export default {async evaluate() {
          const line = JSON.stringify({type:'result',result:{cards:[],nextRunAt:null}})+'\\n';
          process.stdout.write(line);
          await new Promise(resolve => setTimeout(resolve, 150));
          ${ending}
        }}`),
        {},
        (result) => {
          saved = result;
        },
      );
      await expect(run.done).rejects.toThrow("execution-failed");
      expect(saved).toBe(previous);
    }
  },
  30000,
);
check(
  "Docker: successful one-shot results validate at completion and connections publish live",
  async () => {
    const invalid = await runContainer(
      pkg("export default {evaluate(){return {cards:[]}}}"),
      {},
      () => {
        throw new Error("invalid-result");
      },
    );
    await expect(invalid.done).rejects.toThrow("execution-failed");
    let published!: () => void;
    const publication = new Promise<void>((resolve) => {
      published = resolve;
    });
    const connection = pkg(
      "export default {async run({publish}) {await publish({datasets:{items:[]}});setInterval(()=>{},1000)}}",
      true,
    );
    connection.manifest.permissions = {};
    const live = await runContainer(connection, {}, () => published());
    const completion = live.done.catch(() => {});
    try {
      await Promise.race([
        publication,
        Bun.sleep(3000).then(() => {
          throw new Error("publication-timeout");
        }),
      ]);
    } finally {
      await live.stop();
      await completion;
    }
  },
  10000,
);
check(
  "Docker: scenario cannot reach network, read host data or escape read-only root",
  async () => {
    await readiness();
    let output: any;
    const run = await runContainer(
      pkg(
        `import fs from 'node:fs';export default {async evaluate(){let blocked=0;for(const path of ['/data/peek.sqlite','/var/run/docker.sock','/root/.ssh/id_rsa']){try{fs.readFileSync(path)}catch{blocked++}}try{fs.writeFileSync('/runner/test','x')}catch{blocked++}try{await fetch('https://example.com',{signal:AbortSignal.timeout(1000)})}catch{blocked++}return {blocked,uid:process.getuid()}}}`,
      ),
      {},
      (r) => (output = r),
    );
    await run.done;
    expect(output).toEqual({ blocked: 5, uid: 1000 });
  },
  20000,
);
check(
  "Docker: arbitrary TCP library cannot reach loopback, metadata or private networks",
  async () => {
    let output: any;
    const run = await runContainer(
      pkg(
        `import net from 'node:net';const connect=host=>new Promise(resolve=>{const s=net.connect({host,port:80});s.setTimeout(500);s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));s.on('timeout',()=>{s.destroy();resolve(false)});});export default {async run(){const reachable=await Promise.all(['127.0.0.1','169.254.169.254','10.0.0.1','192.168.1.1','172.17.0.1'].map(connect));return {reachable}}}`,
        true,
      ),
      {},
      (r) => (output = r),
    );
    await run.done;
    expect(output.reachable).toEqual([false, false, false, false, false]);
  },
  20000,
);
check(
  "Docker: infinite scenario is terminated",
  async () => {
    const run = await runContainer(
      pkg("export default {evaluate(){while(true){}}}"),
      {},
      () => {},
    );
    await expect(run.done).rejects.toThrow();
  },
  20000,
);
check(
  "Docker: migration executes without network and returns only new settings/state",
  async () => {
    let output: any;
    const run = await runContainer(
      pkg(
        "export default {migrate({settings,state}){return {settings:{...settings,version:2},state}}}",
      ),
      { settings: { name: "test" }, state: null },
      (r) => (output = r),
      "migrate",
    );
    await run.done;
    expect(output.settings.version).toBe(2);
  },
  15000,
);
check(
  "Docker: live publications do not starve slow scenarios, and connections recover on restart",
  async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const { openStore } = await import("../packages/db/src");
    const { openExtensions } = await import("../packages/extensions/src/store");
    const dir = mkdtempSync(join(tmpdir(), "peek-runner-test-")),
      path = join(dir, "peek.sqlite");
    const main = openStore(path);
    main.migrate();
    const store = openExtensions(path);
    let child: ReturnType<typeof Bun.spawn> | undefined;
    async function until(check: () => boolean) {
      const deadline = Date.now() + 25000;
      while (!check()) {
        if (Date.now() > deadline) throw new Error("runner-timeout");
        await Bun.sleep(100);
      }
    }
    const start = () =>
      Bun.spawn([process.execPath, "src/index.ts"], {
        cwd: resolve("apps/extension-runner"),
        env: {
          ...process.env,
          PEEK_DATABASE_PATH: path,
          PEEK_RUNNER_NAMESPACE: dir.split("/").pop(),
        },
        stdout: "ignore",
        stderr: "inherit",
      });
    try {
      const source = pkg(
        `export default {async run({state,publish}){const count=(state?.count??0)+1; for (;;) {await publish({datasets:{items:['Runner verified']},state:{count},nextRunAt:null}); await new Promise(r=>setTimeout(r,200));}}}`,
      );
      source.manifest.kind = "connection";
      source.manifest.id = "test/source";
      source.manifest.provides = {
        items: {
          id: "test/items",
          version: "1.0.0",
          schema: { type: "array", items: { type: "string" } },
        },
      };
      const scenario = pkg(
        `export default {async evaluate({inputs,now}){await new Promise(r=>setTimeout(r,3000));return {cards:inputs.items.flatMap(s=>s.data.map((title,index)=>({id:String(index),title,visibleFrom:now,targetAt:now+60000,expiresAt:now+60000}))),nextRunAt:null}}}`,
      );
      scenario.manifest.id = "test/cards";
      scenario.manifest.inputs = {
        items: { contract: "test/items", version: "^1.0.0" },
      };
      scenario.manifest.contracts = [source.manifest.provides.items];
      scenario.manifest.dependencies = [
        { id: "test/source", version: "^0.1.0" },
      ];
      const preview = store.stage([source, scenario], ["test/cards"]);
      store.confirm(preview.id);
      child = start();
      await until(() => store.installed().some((p) => p.id === "test/cards"));
      const connection = store.save({
        packageId: "test/source",
        name: "Source",
        profileId: "shared",
        settings: {},
        bindings: {},
        enabled: true,
      });
      store.save({
        packageId: "test/cards",
        name: "Cards",
        profileId: "shared",
        settings: {},
        bindings: { items: [{ connectionId: connection, dataset: "items" }] },
        enabled: true,
      });
      await until(() =>
        main.snapshot().cards.some((c) => c.title === "Runner verified"),
      );
      expect(JSON.parse(store.instance(connection)!.state).count).toBe(1);
      child.kill("SIGTERM");
      await child.exited;
      child = start();
      await until(
        () => JSON.parse(store.instance(connection)!.state).count === 2,
      );
      expect(main.snapshot().cards.length).toBe(1);
    } finally {
      if (child) {
        child.kill("SIGTERM");
        await child.exited;
      }
      store.close();
      main.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
  60000,
);

check(
  "Docker: bundled iCalendar parses floating/DST events and both official scenarios publish through the common store",
  async () => {
    const { readFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { openStore } = await import("../packages/db/src");
    const { officialStore, connection, scenario, packages } = await import(
      "./helpers/official"
    );
    const dir = mkdtempSync(join(tmpdir(), "peek-official-docker-")),
      path = join(dir, "db.sqlite");
    const main = openStore(path);
    main.migrate();
    const store = officialStore(path);
    const now = Date.UTC(2026, 9, 25, 5, 55);
    try {
      const c = connection(store);
      const sourcePackage = structuredClone(
        packages.find((p) => p.manifest.id === "peek/ical")!,
      );
      const body = readFileSync("tests/fixtures/calendar.ics", "utf8");
      // Deterministic transport fixture only: the CLI-produced SDK implementation
      // and its bundled node-ical/Luxon code below are unchanged. No public service
      // or calendar account is needed for this runtime regression test.
      sourcePackage.manifest.permissions = {};
      sourcePackage.files["index.mjs"] =
        `
import __https from 'node:https';
import __dns from 'node:dns/promises';
import {syncBuiltinESMExports as __sync} from 'node:module';
import {Readable as __Readable} from 'node:stream';
import {EventEmitter as __Emitter} from 'node:events';
__dns.lookup = async () => [{address:'1.1.1.1',family:4}];
__https.request = (url, options, callback) => {
  const req = new __Emitter();
  req.end = () => queueMicrotask(() => {
    const res = __Readable.from([Buffer.from(${JSON.stringify(body)})]);
    res.statusCode=200;res.headers={};callback(res);
  });
  return req;
};
__sync();
` + sourcePackage.files["index.mjs"];
      const i = store.instance(c)!;
      const run = await runContainer(
        sourcePackage,
        { ...store.context(i), now },
        (result) => store.publish(i, result),
      );
      await run.done;
      const events = JSON.parse(store.instance(c)!.snapshots).events.data
        .events;
      expect(
        events.find((e: { id: string }) => e.id.startsWith("floating:"))
          .startAt,
      ).toBe(Date.UTC(2026, 9, 25, 6));
      expect(
        events.find((e: { kind: string }) => e.kind === "all-day").startDate,
      ).toBe("2026-10-25");
      expect(JSON.parse(store.instance(c)!.state)).toBeNull();
      for (const kind of ["meetings", "deadlines"]) {
        const id = scenario(store, [c], "shared", kind),
          instance = store.instance(id)!;
        const task = await runContainer(
          store.getPackage(instance.package_id),
          { ...store.context(instance), now },
          (result) => store.publish(instance, result),
        );
        await task.done;
        expect(store.instance(id)!.last_error).toBeNull();
        expect(store.instance(id)!.last_success).not.toBeNull();
      }
      expect(main.snapshot().cards.some((c) => c.kind === "meeting")).toBe(
        true,
      );
      expect(main.snapshot().cards.some((c) => c.kind === "deadline")).toBe(
        true,
      );
      expect(
        main.snapshot().cards.every((c) => c.owner.profileId === "shared"),
      ).toBe(true);
    } finally {
      store.close();
      main.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
  30000,
);

check(
  "Docker: malformed protocol output cannot publish subsequent results",
  async () => {
    const output: unknown[] = [];
    const run = await runContainer(
      pkg(`export default {async evaluate() {
      process.stdout.write('not json\\n');
      setInterval(() => process.stdout.write(JSON.stringify({type:'result',result:{cards:[],nextRunAt:null}})+'\\n'), 150);
      await new Promise(() => {});
    }}`),
      {},
      (result) => output.push(result),
    );
    await expect(run.done).rejects.toThrow("execution-failed");
    expect(output).toEqual([]);
  },
  20000,
);

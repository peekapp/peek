import { expect, test } from "bun:test";
import { readiness, runContainer } from "../apps/extension-runner/src/docker";
import type { ExtensionPackage } from "../packages/extensions/src/archive";
const check = process.env.PEEK_TEST_DOCKER === "1" ? test : test.skip;
function pkg(code: string, integration = false): ExtensionPackage {
  return {
    manifest: {
      format: 1,
      sdk: "^0.1.0",
      id: "test/isolation",
      version: "0.1.0",
      kind: integration ? "integration" : "scenario",
      name: "Isolation",
      description: "Test",
      author: "Tests",
      entry: "index.mjs",
      settings: { type: "object" },
      permissions: integration ? { internet: true } : {},
    },
    files: { "index.mjs": code },
  };
}
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
  "Docker: runner installs, executes and recovers a custom integration/scenario pair",
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
        `export default {run({state}){return {datasets:{items:['Runner verified']},state:{count:(state?.count??0)+1},nextRunAt:null}}}`,
      );
      source.manifest.kind = "integration";
      source.manifest.id = "test/source";
      source.manifest.provides = {
        items: {
          id: "test/items",
          version: "1.0.0",
          schema: { type: "array", items: { type: "string" } },
        },
      };
      const scenario = pkg(
        `export default {evaluate({inputs,now}){return {cards:inputs.items.flatMap(s=>s.data.map((title,index)=>({id:String(index),title,visibleFrom:now,targetAt:now+60000,expiresAt:now+60000}))),nextRunAt:null}}}`,
      );
      scenario.manifest.id = "test/cards";
      scenario.manifest.inputs = {
        items: { contract: "test/items", version: "^1.0.0" },
      };
      scenario.manifest.dependencies = [
        { id: "test/source", version: "^0.1.0" },
      ];
      const preview = store.stage([source, scenario], ["test/cards"]);
      store.confirm(preview.id);
      child = start();
      await until(() => store.installed().length === 2);
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

import { provisionOfficial } from "./provision";
import { databasePath, openStore } from "@peek/db";
import { openExtensions } from "@peek/extensions/store";
import { readiness, runContainer, cleanup, type Run } from "./docker";
const main = openStore(databasePath());
main.migrate();
main.close();
const store = openExtensions(databasePath());
const running = new Map<
  string,
  { generation: number; kind: "scenario" | "connection"; run: Run }
>();
let migration: Run | undefined;
let stopped = false,
  busy = false;
async function tick() {
  if (stopped || busy) return;
  busy = true;
  try {
    await readiness();
    store.heartbeat(null);
    for (const [id, job] of running) {
      const i = store.executionStatus(id);
      if (!i || !i.enabled || i.generation !== job.generation) {
        await job.run.stop();
        running.delete(id);
      }
    }
    provisionOfficial(store);
    const op = store.pending();
    if (op) {
      try {
        let { packages, affected } = store.installInput(op);
        for (const i of affected) {
          const job = running.get(i.id);
          if (job) {
            await job.run.stop();
            await job.run.done.catch(() => {});
            running.delete(i.id);
          }
        }
        ({ packages, affected } = store.installInput(op));
        const migrated: Record<string, any> = {};
        for (const i of affected) {
          if (stopped) throw new Error("runner-stopping");
          store.heartbeat(null);
          const p = packages.find((p) => p.manifest.id === i.package_id)!;
          const task = await runContainer(
            p,
            {
              fromVersion: store.getPackage(i.package_id).manifest.version,
              settings: JSON.parse(i.settings),
              state: JSON.parse(i.state),
            },
            (result) => {
              migrated[i.id] = result;
            },
            "migrate",
          );
          migration = task;
          try {
            await task.done;
          } finally {
            migration = undefined;
          }
        }
        if (stopped) throw new Error("runner-stopping");
        store.commitInstall(op, affected, migrated);
      } catch (error) {
        if (!stopped)
          store.fail(
            op.id,
            error instanceof Error ? error.message : "installation-failed",
          );
      }
    }
    for (const i of store.due()) {
      if (stopped) break;
      const activeCount = [...running.values()].filter(
        (job) => job.kind === i.kind,
      ).length;
      if (activeCount >= (i.kind === "scenario" ? 4 : 8)) continue;
      if (running.has(i.id)) continue;
      try {
        const run = await runContainer(
          store.getPackage(i.package_id),
          store.context(i),
          (result) => {
            store.publish(i, result);
          },
        );
        running.set(i.id, { generation: i.generation, kind: i.kind, run });
        void run.done
          .catch(() => {
            if (!stopped) store.retry(i, "execution-failed");
          })
          .finally(() => {
            if (running.get(i.id)?.run === run) running.delete(i.id);
          });
      } catch {
        store.retry(i, "execution-unavailable");
      }
    }
  } catch {
    store.heartbeat("container-isolation-unavailable");
  } finally {
    busy = false;
  }
}
await cleanup().catch(() => {});
store.recover();
const timer = setInterval(() => void tick(), 2000);
await tick();
async function shutdown() {
  stopped = true;
  clearInterval(timer);
  await migration?.stop();
  await Promise.allSettled([...running.values()].map((x) => x.run.stop()));
  while (busy) await new Promise((r) => setTimeout(r, 50));
  store.heartbeat("runner-stopped");
  store.close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

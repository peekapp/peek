import { readFileSync } from "node:fs";
import { decode } from "../../packages/extensions/src/archive";
import {
  openExtensions,
  type ExtensionStore,
} from "../../packages/extensions/src/store";
import type { Json } from "@peekapp/sdk";
import meeting from "../../extensions/official/meetings";
import deadline from "../../extensions/official/deadlines";
export const packages = decode(
  readFileSync(new URL("../../extensions/dist/official.peek", import.meta.url)),
).packages;
export function officialStore(path: string) {
  const store = openExtensions(path);
  store.provision(packages);
  const op = store.pending();
  if (op) store.commitInstall(op, store.installInput(op).affected, {});
  return store;
}
export const settings = {
  leadMinutes: 10,
  urgentMinutes: 1,
  retainMinutes: 5,
  filterText: "",
};
export function connection(store: ExtensionStore, profileId = "shared") {
  return store.save({
    packageId: "peek/ical",
    name: "Calendar",
    profileId,
    settings: { timeZone: "Europe/Moscow", intervalSeconds: 60 },
    secrets: { url: "https://example.com/secret.ics" },
    bindings: {},
    enabled: true,
  });
}
export function scenario(
  store: ExtensionStore,
  sources: string[],
  profileId = "shared",
  kind = "meetings",
) {
  return store.save({
    packageId: `peek/${kind}`,
    name: kind,
    profileId,
    settings,
    bindings: {
      events: sources.map((connectionId) => ({
        connectionId,
        dataset: "events",
      })),
    },
    enabled: true,
  });
}
export function publish(store: ExtensionStore, id: string, events: Json) {
  return store.publish(store.instance(id)!, {
    datasets: { events },
    nextRunAt: Date.now() + 60000,
  });
}
// Unit tests execute the same SDK definition; Docker tests exercise the bundled runtime.
export function evaluate(store: ExtensionStore, id: string, now = Date.now()) {
  const i = store.instance(id)!;
  const handler = i.package_id === "peek/meetings" ? meeting : deadline;
  return store.publish(i, handler.evaluate({ ...store.context(i), now }));
}

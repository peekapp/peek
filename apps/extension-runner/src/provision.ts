import { readFileSync } from "node:fs";
import { decode } from "@peek/extensions/archive";
import type { ExtensionStore } from "@peek/extensions/store";
const packages = decode(
  readFileSync(
    new URL("../../../extensions/dist/official.peek", import.meta.url),
  ),
).packages;
export function provisionOfficial(store: ExtensionStore) {
  store.provision(packages);
}

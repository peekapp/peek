import { openStore } from "../../packages/db/src";
import { openExtensions } from "../../packages/extensions/src/store";
import fixture from "../fixtures/settings-manifest.json";
import type { Manifest } from "@peekapp/sdk";

const path = process.env.PEEK_DATABASE_PATH;
if (!path?.startsWith("/tmp/peek-settings-"))
  throw new Error("Use an isolated /tmp/peek-settings-* database");
const main = openStore(path);
main.migrate();
const store = openExtensions(path);
const connection = structuredClone(fixture) as Manifest;
const scenario = structuredClone(connection);
scenario.kind = "scenario";
scenario.id = "test/settings-scenario";
scenario.name = "Scenario settings controls";
delete scenario.secrets;
scenario.settingsUi.blocks = scenario.settingsUi.blocks.filter(
  (b) => b.source !== "secrets",
);
const packages = [connection, scenario].map((manifest) => ({
  manifest,
  files: { "index.mjs": "export default {};" },
}));
const review = store.stage(
  packages,
  packages.map((p) => p.manifest.id),
);
store.confirm(review.id);
const operation = store.pending()!;
store.commitInstall(operation, store.installInput(operation).affected, {});
for (const m of [connection, scenario]) {
  store.save({
    packageId: m.id,
    name: m.name,
    profileId: "shared",
    enabled: true,
    settings: Object.fromEntries(
      Object.entries(m.settings.properties!)
        .filter(([, s]) => s.default !== undefined)
        .map(([k, s]) => [k, s.default!]),
    ),
    bindings: {},
    ...(m.secrets ? { secrets: { token: "never-return-this-token" } } : {}),
  });
}
store.close();
main.close();

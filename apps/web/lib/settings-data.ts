import { iconDataUrl, type ExtensionPackage } from "@peek/extensions/archive";
import { defaultTheme } from "@peek/core/themes";
import { openExtensions } from "@peek/extensions/store";
import { databasePath, openStore, installationTimeZone } from "@peek/db";

export function readSettings() {
  const store = openStore(databasePath(), true);
  let extensions: ReturnType<typeof openExtensions> | undefined;
  try {
    extensions = openExtensions(databasePath());
    const icons = new Map(extensions.installed().map((installed) => {
      const pkg = JSON.parse(installed.payload) as ExtensionPackage;
      return [installed.id, { iconDataUrl: iconDataUrl(pkg), iconColor: pkg.manifest.iconColor }] as const;
    }));
    const instances = extensions.instances();
    const snapshot = store.snapshot();
    return {
      timeZone: installationTimeZone(),
      screens: store.listScreens(),
      profiles: store.listProfiles(),
      scenarios: instances
        .filter((i) => i.kind === "scenario")
        .map((i) => ({ id: i.id, name: i.name, profileId: i.profile_id, ...icons.get(i.package_id) })),
      connections: instances
        .filter((i) => i.kind === "connection")
        .map((i) => ({ id: i.id, name: i.name, profileId: i.profile_id, ...icons.get(i.package_id) })),
      locale: snapshot.locale ?? "en",
      theme: snapshot.theme ?? defaultTheme,
    };
  } finally {
    extensions?.close();
    store.close();
  }
}

export function readExtensions() {
  const store = openExtensions(databasePath());
  try {
    return store.status();
  } finally {
    store.close();
  }
}

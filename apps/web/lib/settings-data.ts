import { defaultTheme } from "@peek/core/themes";
import { openExtensions } from "@peek/extensions/store";
import { databasePath, openStore, installationTimeZone } from "@peek/db";

export function readSettings() {
  const store = openStore(databasePath(), true);
  let extensions: ReturnType<typeof openExtensions> | undefined;
  try {
    extensions = openExtensions(databasePath());
    const instances = extensions.instances();
    const snapshot = store.snapshot();
    return {
      timeZone: installationTimeZone(),
      screens: store.listScreens(),
      profiles: store.listProfiles(),
      scenarios: instances
        .filter((i) => i.kind === "scenario")
        .map((i) => ({ id: i.id, profileId: i.profile_id })),
      connections: instances
        .filter((i) => i.kind === "integration")
        .map((i) => ({ id: i.id, profileId: i.profile_id })),
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

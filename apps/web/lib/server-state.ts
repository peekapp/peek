import { databasePath, openStore } from "@peek/db";

export function readState(screenId?: string) {
  const store = openStore(databasePath(), true);
  try {
    return store.snapshot(Date.now(), screenId);
  } finally {
    store.close();
  }
}

import { databasePath, openStore } from "@peek/db";

export function readState() {
  const store = openStore(databasePath(), true);
  try {
    return store.snapshot();
  } finally {
    store.close();
  }
}

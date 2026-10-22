import { openExtensions } from "@peek/extensions/store";
import { provisionOfficial } from "../../extension-runner/src/provision";
import { databasePath, openStore } from "@peek/db";
const store = openStore(databasePath());
try {
  store.migrate();
  console.log("Database ready.");
} finally {
  store.close();
}

const extensions = openExtensions(databasePath());
try {
  provisionOfficial(extensions);
} finally {
  extensions.close();
}

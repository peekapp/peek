import { databasePath, openStore } from "@peek/db";
const store = openStore(databasePath());
try {
  store.migrate();
  console.log("Database ready.");
} finally {
  store.close();
}

import { databasePath, openStore } from "@peek/db";
import { createDemoCards } from "@peek/core/demo";
const store = openStore(databasePath());
try {
  store.migrate();
  console.log(
    store.seedDemo(createDemoCards(Date.now()))
      ? "Demo events saved."
      : "Demo already seeded; existing times preserved.",
  );
} finally {
  store.close();
}

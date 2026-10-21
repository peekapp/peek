import { databasePath, openStore } from "../packages/db/src";
import { workerHealthy } from "../packages/core/src/state";
try {
  if (process.argv[2] === "web") {
    const response = await fetch("http://127.0.0.1:3000/api/screen", {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error();
    const state = await response.json();
    if (!Array.isArray(state.cards) || typeof state.revision !== "number")
      throw new Error();
  } else if (process.argv[2] === "worker") {
    const store = openStore(databasePath(), true);
    try {
      if (!workerHealthy(store.snapshot().heartbeat, Date.now()))
        throw new Error();
    } finally {
      store.close();
    }
  } else throw new Error();
} catch {
  process.exit(1);
}

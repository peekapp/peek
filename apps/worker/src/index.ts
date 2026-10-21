import { databasePath, openStore } from "@peek/db";
const store = openStore(databasePath());
store.migrate();
store.runDue();
store.tick();
console.log("Peek worker running (5-second heartbeat).");
const timer = setInterval(() => {
  try {
    store.runDue();
    store.tick();
  } catch (error) {
    console.error("Worker tick failed:", error);
    shutdown(1);
  }
}, 5000);
function shutdown(code: number) {
  clearInterval(timer);
  try {
    store.stop();
  } finally {
    store.close();
    process.exit(code);
  }
}
process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

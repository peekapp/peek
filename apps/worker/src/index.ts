import { databasePath, openStore } from "@peek/db";
let stopping = false;
const store = openStore(databasePath());
store.migrate();
store.tick();
console.log("Peek worker running (5-second heartbeat).");
const timer = setInterval(() => {
  try {
    store.tick();
  } catch (error) {
    console.error("Worker tick failed:", error);
    shutdown(1);
  }
}, 5000);
async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
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

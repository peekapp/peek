import { databasePath, openStore } from "@peek/db";
import { syncCalendar } from "@peek/ical";
const pending = new Map<string, Promise<void>>();
let stopping = false;
const store = openStore(databasePath());
store.migrate();
store.runDue();
store.tick();
function syncDue() {
  for (const row of store.dueCalendars()) {
    if (pending.size >= 3) break;
    if (pending.has(row.id)) continue;
    const task = syncCalendar(store, row).finally(() => pending.delete(row.id));
    pending.set(row.id, task);
  }
}
syncDue();
console.log("Peek worker running (5-second heartbeat).");
const timer = setInterval(() => {
  try {
    syncDue();
    store.runDue();
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
  await Promise.allSettled(pending.values());
  try {
    store.stop();
  } finally {
    store.close();
    process.exit(code);
  }
}
process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

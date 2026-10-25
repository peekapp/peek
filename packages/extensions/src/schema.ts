import type { Database } from "bun:sqlite";
export function migrateExtensions(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS extension_contracts (id TEXT NOT NULL, version TEXT NOT NULL, schema TEXT NOT NULL, PRIMARY KEY(id, version));
    CREATE TABLE IF NOT EXISTS extension_defaults (id TEXT PRIMARY KEY, digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS extension_packages (id TEXT PRIMARY KEY, payload TEXT NOT NULL, explicit INTEGER NOT NULL, installed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS extension_instances (id TEXT PRIMARY KEY, package_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, profile_id TEXT NOT NULL, settings TEXT NOT NULL, secret TEXT, bindings TEXT NOT NULL, enabled INTEGER NOT NULL, generation INTEGER NOT NULL, state TEXT NOT NULL, next_run_at INTEGER, last_success INTEGER, last_error TEXT, snapshots TEXT NOT NULL, data_revision INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS extension_instances_due ON extension_instances(enabled, next_run_at);
    CREATE TABLE IF NOT EXISTS extension_operations (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS extension_history (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS extension_runtime (id INTEGER PRIMARY KEY CHECK(id = 1), heartbeat INTEGER, error TEXT);
  `);
}

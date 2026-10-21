# Peek

A self-hosted, glanceable screen for meetings and deadlines. Designed for a second monitor, tablet, or TV: configure it once, then let relevant events appear and disappear automatically.

## Current stage

The **Night** interface runs on Next.js, React, and TypeScript. A separate Bun worker maintains a local SQLite database through Drizzle ORM. The web process reads consistent snapshots and streams updates to the screen over Server-Sent Events (SSE).

Implemented:

- Persistent cards, versioned schema migration, WAL mode, and transactional updates.
- A worker heartbeat every five seconds and automatic removal of expired cards.
- Priority-based ordering, a large primary card, live countdowns, and an empty state.
- Distinct warnings for lost server connection, unavailable storage, and a stopped worker.
- English and Russian interface dictionaries with a persistent language selection. Event titles and profile names support Unicode.
- Editable Meetings/Deadlines scenarios with persistent configuration, source bindings, next-run times, retries, and execution status.
- Relative event labels: time only today, Tomorrow/Завтра, nearby weekdays, then calendar dates.

Calendar integrations, account setup, authentication, and Docker delivery are **not implemented yet**. This is a local development milestone, not a deployable multi-user service. Both web commands bind to loopback; keep them local until access control is implemented.

## Requirements

- Bun **1.4.2** (required at runtime, including for Next.js, because storage uses `bun:sqlite`).
- Node.js **24** for development tooling and CI.
- A local filesystem for SQLite; network-mounted database files are not supported.

## Quick start

From the repository root:

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run db:seed          # Optional: insert demo events once
```

Start the worker in one terminal:

```sh
bun worker
```

Start the web app in another:

```sh
bun dev
```

Open [localhost:3000](http://localhost:3000). For a production build of this local milestone:

```sh
bun run build
bun start
```

Keep the worker running in either mode. It applies pending migrations at startup, writes a heartbeat, then evaluates due scenarios and removes expired cards every five seconds. A due job may therefore start up to five seconds after its scheduled time. SIGINT/SIGTERM marks it stopped before closing the database. An abrupt exit is detected after 30 seconds without a heartbeat. Restart it with `bun worker`; it resumes from stored data.

## Persistent data and demo events

The default database is `data/peek.sqlite` at the repository root. It and its WAL/SHM companions are ignored by Git. Run the commands above from the repository root so both processes resolve the same location.

To use another location, set an **absolute** path in both terminals, before running migrations, seed, worker, or web commands:

```sh
export PEEK_DATABASE_PATH=/absolute/path/to/peek.sqlite
```

The seed command creates two default scenarios, a meeting 48 seconds in the future and three deadlines. Schema migration v2 converts existing card fixtures into scenario source events without resetting their times. It is explicitly opt-in and idempotent: reloading the browser, restarting either process, or running the command again does not reset event times or recreate expired events. The seed marker persists even after all cards expire. To try a fresh demo without deleting existing data, point both processes at a new database path and run the setup commands there.

By default, meetings expire five minutes after their start. Deadlines become urgent 24 hours before their target and remain visible as **Overdue** for 24 hours afterwards. The screen also filters expired cards locally if the connection is down. UTC timestamps are stored; the display timezone is currently fixed to **Europe/Moscow**, with formatting in the selected interface language.

There is no external calendar synchronization yet. Russian demo titles and profile names are intentional sample content, not interface translations.

## Development checks

```sh
bun run test
bun typecheck
bun run build
```

GitHub Actions runs all three checks. Tests cover timing boundaries, ordering, transaction rollback, migration idempotency, persistence across database reopening, repeated seeding, expiry cleanup, and worker health.

## Architecture

```text
apps/web/         Next.js screen, local Settings, state/SSE endpoints
apps/worker/      Independent Bun worker, migration and seed commands
packages/core/    Cards, scenario definitions/handlers, i18n, time rules
packages/db/      Drizzle schema and SQLite persistence/migration boundary
assets/brand/     Original brand assets
docs/             Product plan and design decisions
tests/            Core and persistence tests
```

The worker executes scenarios. Screen requests use read-only connections; Settings writes configuration in short transactions and queues execution for the worker. Web requests never seed, migrate, or run scenarios. `/api/screen` returns a full snapshot. `/api/screen/events` shares one polling loop per web process across connected screens, delivering full snapshots and server time every second. Revisions prevent older snapshots from replacing newer state. Subscriptions and timers are released on disconnect.

Only one worker and one web process per installation are supported. The worker handles due scenarios, card expiry, and health. The local `/api/settings` endpoint accepts scenario and language changes only with a loopback Host and same-origin browser requests. This is not a replacement for authentication; remote access remains unsupported.

## Backup and restore

Stop **both** processes before copying the database directory, including any `-wal` and `-shm` files. Restore the files together, preserving their names, then restart the worker and web process with the same database path. Do not replace a live database. This milestone stores no integration credentials; encryption and secret backup procedures will be added with integrations.

## Repository scope and next steps

`peekapp/peek` contains the application, worker, and shared packages. Future standalone extensions, the project website, or documentation hosting can live in separate repositories in the organization.

Next: administrator setup and access control, followed by real source connections and the first iCalendar integration. The current registry contains two trusted local scenario handlers; a complete external extension SDK is not implemented yet.

The detailed [MVP plan](docs/mvp-plan.md), [design decisions](docs/design.md), and [future ideas](docs/future-ideas.md) are currently maintained in Russian. The application and this README default to English.

A distribution license has not been selected yet.

## Scenario settings

Open **Settings** from the screen footer, or visit `/settings`.

- Create multiple Meetings or Deadlines instances and give each a name.
- Bind an instance to a saved demo source. Sources are shared; each scenario receives only its bound source events.
- Configure visibility, priority, and retention in minutes. Visibility must begin before priority escalation; the horizon is 90 days and retention is at most 24 hours.
- Optionally filter titles by case-insensitive text matching. An empty filter includes every event from the selected source.
- Save to schedule immediate re-evaluation; disable or delete to remove that scenario's cards. The main screen updates over SSE.
- Inspect last and next execution times. A scenario with no future boundaries waits for a settings or source change. A failed handler retains its last cards until they expire, records an error, and retries after 60 seconds without stopping other scenarios.

Each execution replaces only its own cards and commits the next-run timestamp in the same transaction. Stable IDs combine scenario ID and source event ID. Missed runs after a restart evaluate current state rather than replaying obsolete cards. Source replacement also schedules its consumers, including when events are cancelled or moved.

Settings also switches the installation's screen language between English (default) and Russian. It applies to connected screens, persists across restarts, and never translates user content. Day comparisons use the display timezone, so a meeting just after midnight is tomorrow even if it is only minutes away.

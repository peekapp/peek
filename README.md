# Peek

A self-hosted, glanceable screen for meetings and deadlines. Designed for a second monitor, tablet, or TV: configure it once, then let relevant events appear and disappear automatically.

## Current stage

The **Night** interface runs on Next.js, React, and TypeScript. A separate Bun worker maintains a local SQLite database through Drizzle ORM. The web process reads consistent snapshots and streams updates to the screen over Server-Sent Events (SSE).

Implemented:

- Persistent cards, versioned schema migration, WAL mode, and transactional updates.
- A worker heartbeat every five seconds and automatic removal of expired cards.
- Priority-based ordering, a large primary card, live countdowns, and an empty state.
- Distinct warnings for lost server connection, unavailable storage, and a stopped worker.
- English interface labels and date formatting. Event titles and profile names support Unicode, including Russian.

Calendar integrations, scenario execution, account setup, authentication, and Docker delivery are **not implemented yet**. This is a local development milestone, not a deployable multi-user service. Both web commands bind to loopback; keep them local until access control is implemented.

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

Keep the worker running in either mode. It applies pending migrations at startup, writes a heartbeat, then checks for expired cards every five seconds. SIGINT/SIGTERM marks it stopped before closing the database. An abrupt exit is detected after 30 seconds without a heartbeat. Restart it with `bun worker`; it resumes from stored data.

## Persistent data and demo events

The default database is `data/peek.sqlite` at the repository root. It and its WAL/SHM companions are ignored by Git. Run the commands above from the repository root so both processes resolve the same location.

To use another location, set an **absolute** path in both terminals, before running migrations, seed, worker, or web commands:

```sh
export PEEK_DATABASE_PATH=/absolute/path/to/peek.sqlite
```

The seed command creates a meeting 48 seconds in the future and three deadlines. It is explicitly opt-in and idempotent: reloading the browser, restarting either process, or running the command again does not reset event times or recreate expired events. The seed marker persists even after all cards expire. To try a fresh demo without deleting existing data, point both processes at a new database path and run the setup commands there.

Meetings expire five minutes after their start. Deadlines become urgent 24 hours before their target and remain visible as **Overdue** for 24 hours afterwards. The screen also filters expired cards locally if the connection is down. UTC timestamps are stored; the display timezone is currently fixed to **Europe/Moscow**, with English formatting.

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
apps/web/         Next.js screen and read-only state/SSE endpoints
apps/worker/      Independent Bun worker, migration and seed commands
packages/core/    Card model, time rules, shared snapshot contract, demo fixture
packages/db/      Drizzle schema and SQLite persistence/migration boundary
assets/brand/     Original brand assets
docs/            Product plan and design decisions
tests/           Core and persistence tests
```

The worker is the only long-running writer. The web process opens read-only connections; it never seeds, migrates, or performs background work inside a request. `/api/screen` returns a full snapshot. `/api/screen/events` shares one polling loop per web process across connected screens, delivering full snapshots and server time every second. Revisions prevent older snapshots from replacing newer state. Subscriptions and timers are released on disconnect.

Only one worker and one web process per installation are supported. The worker currently handles card expiry and health only; durable scenario scheduling and integration execution are the next milestone. There are no public mutation endpoints.

## Backup and restore

Stop **both** processes before copying the database directory, including any `-wal` and `-shm` files. Restore the files together, preserving their names, then restart the worker and web process with the same database path. Do not replace a live database. This milestone stores no integration credentials; encryption and secret backup procedures will be added with integrations.

## Repository scope and next steps

`peekapp/peek` contains the application, worker, and shared packages. Future standalone extensions, the project website, or documentation hosting can live in separate repositories in the organization.

Next: persist scenario configuration and schedules, implement the local extension contract, then add administrator setup and the first iCalendar integration.

The detailed [MVP plan](docs/mvp-plan.md), [design decisions](docs/design.md), and [future ideas](docs/future-ideas.md) are currently maintained in Russian. The application and this README default to English.

A distribution license has not been selected yet.

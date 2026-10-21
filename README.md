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
- ICS calendar connections with encrypted subscription URLs, conditional requests, recurring event expansion, and failure recovery.
- Tabbed Settings with scenario summaries, profiles, and dedicated editors.
- Twelve profile colors with visual swatches and a live preview.
- Docker Compose for web, worker, migrations, health checks, and persistent storage.
- Editable Meetings/Deadlines scenarios with persistent configuration, source bindings, next-run times, retries, and execution status.
- Relative event labels: time only today, Tomorrow/Завтра, nearby weekdays, then calendar dates.

Account setup and authentication are **not implemented yet**. Docker Compose and local web commands expose the app only on the host loopback interface. Keep that binding until access control is implemented.

## Docker Compose

With Docker Engine and Docker Compose running, start from the repository root:

```sh
docker compose up --build --wait
```

Open [localhost:3000](http://localhost:3000). If a local development instance already uses port 3000, run `PEEK_PORT=3100 docker compose up --build --wait` and open port 3100 instead. Compose creates a separate named volume; it does not import your local `data/` directory or add demo events.

The same image runs web, worker, and the one-off migration service. Web starts after migration completion and a healthy worker heartbeat. Both long-lived services restart automatically and run as the unprivileged `bun` user. Images use the pinned Bun 1.4.2 runtime. The database and its encryption key share the persistent `peek-data` volume. The Next.js server listens on all interfaces inside its container, while the host port is bound to `127.0.0.1`.

```sh
docker compose ps
docker compose logs --tail=100 web worker
docker compose down             # Stop; keep data
```

To update, back up first, stop the existing services, pull the code, and run `docker compose up --build --wait`. Do not run `docker compose down --volumes` unless you intend to delete the installation's database and encryption key. Docker does not automatically restart an unhealthy but still-running process; inspect health status and logs when a service is unhealthy.

### Backup and restore

Stop both services before copying SQLite and its encryption key. The archive contains the complete data volume, including any WAL/SHM files:

```sh
docker compose down
docker compose run --rm --no-deps -T migrate tar -C /data -czf - . > peek-backup.tar.gz
docker compose up --wait
```

Keep the archive private: it contains both encrypted subscription secrets and their decryption key. Restore into a new Compose project/volume, with the original installation stopped so the port is free:

```sh
docker compose down
docker compose -p peek-restored run --rm --no-deps -T migrate tar -C /data -xzf - < peek-backup.tar.gz
docker compose -p peek-restored up --wait
```

Continue using `-p peek-restored` for that installation. Its volume is separate from the original. GitHub CI checks a clean container startup, persistence across recreation, and restoration into a new volume, including the ability to decrypt a saved connection.

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

ICS calendars are synchronized independently of scenarios. Russian demo titles and profile names are intentional sample content, not interface translations.

## Development checks

```sh
bun run test
bun typecheck
bun run build
```

GitHub Actions runs all three checks. Tests cover timing boundaries, ordering, transaction rollback, migration idempotency, persistence across database reopening, repeated seeding, expiry cleanup, worker health, ICS recurrence/DST/exceptions, all-day/floating times, URL restrictions, encrypted secret storage, 304 responses, and stale in-flight sync results.

## Architecture

```text
apps/web/         Next.js screen, local Settings, state/SSE endpoints
apps/worker/      Independent Bun worker, migration and seed commands
packages/core/    Cards, scenario definitions/handlers, i18n, time rules
packages/db/      Drizzle schema, encrypted secrets, SQLite persistence
packages/ical/    HTTPS fetching, isolated ICS parsing, synchronization
assets/brand/     Original brand assets
docs/             Product plan and design decisions
tests/            Core and persistence tests
```

The worker executes scenarios. Screen requests use read-only connections; Settings writes configuration in short transactions and queues execution for the worker. Web requests never seed, migrate, or run scenarios. `/api/screen` returns a full snapshot. `/api/screen/events` shares one polling loop per web process across connected screens, delivering full snapshots and server time every second. Revisions prevent older snapshots from replacing newer state. Subscriptions and timers are released on disconnect.

Only one worker and one web process per installation are supported. The worker handles due scenarios, card expiry, and health. The local `/api/settings` endpoint accepts scenario and language changes only with a loopback Host and same-origin browser requests. This is not a replacement for authentication; remote access remains unsupported.

## Backup and restore

Stop **both** processes before copying the database directory, including any `-wal` and `-shm` files. Restore the files together, preserving their names, then restart the worker and web process with the same database path. Do not replace a live database. Also back up `secret.key` next to the database (or the separately supplied `PEEK_ENCRYPTION_KEY`). Without the original key, saved subscription URLs and cached feeds cannot be decrypted. Keep the key backup separate from shared database backups.

## Repository scope and next steps

`peekapp/peek` contains the application, worker, and shared packages. Future standalone extensions, the project website, or documentation hosting can live in separate repositories in the organization.

Next: administrator setup and access control, followed by Docker delivery and operational hardening. The current registry contains two trusted local scenario handlers; a complete external extension SDK is not implemented yet.

The detailed [MVP plan](docs/mvp-plan.md), [design decisions](docs/design.md), and [future ideas](docs/future-ideas.md) are currently maintained in Russian. The application and this README default to English.

A distribution license has not been selected yet.

## Scenario settings

Open **Settings** from the screen footer. **Scenarios** is the first and default tab, followed by **Connections**, **Profiles**, and **General** (language preferences). Open a card to edit that scenario on its own page. Each tab and detail page has its own URL. A single **Create scenario** button opens the available scenario definitions in a dialog. **Add connection** similarly selects an integration definition; iCalendar is currently the only supported integration.

- Create multiple Meetings or Deadlines instances and give each a name.
- Bind an instance to a connected ICS calendar or a saved demo source. Sources are shared; each scenario receives only its bound source events.
- Configure visibility, priority, and retention in minutes. Visibility must begin before priority escalation; the horizon is 90 days and retention is at most 24 hours.
- Optionally filter titles by case-insensitive text matching. An empty filter includes every event from the selected source.
- Save to schedule immediate re-evaluation; disable or delete to remove that scenario's cards. The main screen updates over SSE.
- Inspect last and next execution times. A scenario with no future boundaries waits for a settings or source change. A failed handler retains its last cards until they expire, records an error, and retries after 60 seconds without stopping other scenarios.

Each execution replaces only its own cards and commits the next-run timestamp in the same transaction. Stable IDs combine scenario ID and source event ID. Missed runs after a restart evaluate current state rather than replaying obsolete cards. Source replacement also schedules its consumers, including when events are cancelled or moved.

Settings also switches the installation's screen language between English (default) and Russian. It applies to connected screens, persists across restarts, and never translates user content. Day comparisons use the display timezone, so a meeting just after midnight is tomorrow even if it is only minutes away.

The build-time definitions in `packages/core/src/registry.ts` distinguish integration types, configured connections, scenario types, and scenario instances. ICS persistence is still handled by its specific storage adapter; the full extension SDK and generic settings renderer remain planned.

## Profiles and ownership

Create people in **Settings → Profiles**, with a name and one of twelve colors. The form shows selectable color swatches and a live name preview. The built-in **Shared** profile is localized and cannot be renamed or deleted. Profiles organize ownership, not accounts or access permissions.

Select a profile in each connection and scenario. A scenario can explicitly use a connection owned by another profile; its output cards display the scenario owner. Renaming or recoloring a profile updates connected screens immediately without fetching the calendar again. Referenced profiles cannot be deleted; reassign or remove their connections and scenarios first.

Migration preserves schedules and encrypted URLs, deduplicates legacy owners by name and color, and assigns calendar scenarios their connection owner. Demo scenarios with one owner retain it; mixed-owner demo scenarios use Shared. Legacy Shared/Общее owners map to the system profile. New demo scenarios use Shared.

## Connect an ICS calendar

1. Open **Settings → Connections → Add connection → iCalendar**.
2. Paste the calendar provider's **HTTPS ICS subscription URL**. A public sharing-page URL will not work. Private subscription links containing a token are supported; HTTP Basic credentials in the URL are not.
3. Give the connection a name, select an owner profile, and set its timezone. The timezone applies to floating event times and date-only events. The default refresh interval is 60 seconds.
4. Save. The worker schedules an initial download. Open the connection to inspect its status, last successful sync, and event count, or use **Sync now**.
5. Open **Scenarios → Create scenario**, choose Meetings or Deadlines, and select that calendar as the source. The same connection can serve multiple scenarios without duplicate network downloads.

Use **Check connection** on a connection card or its editor to request a worker sync and wait for its result. This verifies both fetching and parsing; successful checks also refresh the stored events. If the worker is unavailable or busy, the UI reports that no result arrived instead of claiming success.

The subscription URL is never returned by the settings API. On edit, leave the password-style URL field blank to keep it. Changing connection settings queues a fresh download and clears the previous source snapshot; changing only scenario settings does not download the source again. A calendar cannot be deleted while a scenario references it.

### Sync behavior

- Public HTTPS only, standard port 443, up to four redirects. DNS results are checked at every hop and the TLS connection is pinned to a validated address. Private, loopback, link-local, multicast, and reserved addresses are rejected; local calendar servers are not supported yet.
- A 15-second network deadline and a 10 MiB response limit. Uncompressed HTTP responses are requested; unsupported content encodings are rejected.
- ETag / Last-Modified conditional requests. Cached feed content is encrypted and re-expanded even after a 304 response, so the rolling future window continues to advance.
- `node-ical` handles RRULE, EXDATE, RECURRENCE-ID, TZID and cancellations. Parsing runs in a separate Bun process with the connection timezone and a ten-second deadline. The output is limited to 10,000 occurrences; secondly recurrence rules are rejected. Titles and locations are capped at 1,000 characters.
- The expansion window covers two days in the past (including yesterday's all-day deadline retention) and 90 days ahead. All-day events are omitted from Meetings; their deadline is the end of their start date in the relevant timezone. Timed deadlines use the start time.
- A failed fetch or parse retains the last successful events, marks the connection unhealthy, and backs off from one minute to a maximum of 15 minutes. The screen warns when any calendar has errors or stale data. A successful full snapshot removes cancelled or missing events.
- Up to three connections sync concurrently, independently of the five-second worker heartbeat. Configuration versions prevent an old in-flight response from overwriting edited or deleted connections.

For floating times, provide the source's actual timezone. Embedded timezone definitions are resolved by the parser; unsupported/custom timezone behavior should be checked against the calendar provider. Calendars requiring interactive login, custom request headers, or OAuth are not supported by the ICS connector.

### Encryption key

On the first calendar save, Peek creates a 32-byte `secret.key` beside the database with owner-only permissions. Both local processes read this file. Alternatively, set `PEEK_ENCRYPTION_KEY` to the same base64-encoded 32-byte key in both processes before saving any calendar. Changing or losing the key prevents decryption; restore the original key, do not generate a replacement for an existing database.

### Network diagnostics

If a public hostname resolves to a reserved address (for example, a synthetic `240.x.x.x` address supplied by a DNS proxy), Peek reports a blocked address. Configure the installation's DNS/network to return real public addresses. The app does not bypass address validation to accommodate such a proxy.

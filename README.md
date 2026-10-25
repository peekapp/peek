# Peek

A self-hosted, glanceable screen for meetings and deadlines. Configure a second monitor, tablet, or TV once, then let relevant cards appear and disappear automatically.

Peek is an MVP for a **trusted home network without accounts or pairing**. Anyone who can reach it can view screens and change settings. Public deployment is outside this MVP's scope.

## Architecture

All connection and scenario extensions are SDK packages. The official `peek/ical`, `peek/meetings`, and `peek/deadlines` packages ship with the application and use the same installation journal, manifests, settings forms, storage, scheduling, validation, and isolated Docker runner as external packages. Neither the web process nor the screen worker imports their handlers.

```text
apps/web/               Next.js screen, Settings, state/SSE endpoints
apps/worker/            Screen heartbeat, card expiry, migration and demo commands
apps/extension-runner/  Shared container execution and package migrations
packages/sdk/           Public connection/scenario contracts
packages/cli/           Public check/pack/bundle/preview commands
packages/extensions/    Package installation, instance storage, validation
packages/core/          Cards, profiles, screens, i18n and time rules
packages/db/            SQLite/Drizzle screen storage and schema
extensions/official/   iCalendar, Meetings and Deadlines source packages
extensions/dist/       Generated .peek packages and official bundle
```

The web process reads consistent SQLite snapshots and streams them over SSE. Settings writes configuration in short transactions. The runner evaluates due scenarios and starts connections; the screen worker expires cards and writes a heartbeat every five seconds. Only one web process, one screen worker, and one runner per installation are supported.

**MVP schema v11 intentionally resets older databases.** Existing connections, scenarios, packages, cards, profiles and screen settings are discarded. There are no legacy calendar/scenario tables or compatibility adapters. Re-running migration on v11 preserves data.

## Docker Compose

With a Linux Docker Engine (or Docker Desktop) and Compose running:

```sh
docker compose up --build --wait
```

Open [localhost:3000](http://localhost:3000). Set `PEEK_PORT=3100` if port 3000 is occupied. Compose builds the application and both extension runtime images, initializes the database, and starts web, worker and runner. The image preparation services exit successfully after building; this is expected. Official packages activate through the runner's installation queue.

Only the runner receives the Docker socket. Set `PEEK_DOCKER_SOCKET` if it is not `/var/run/docker.sock`. Use a distinct `COMPOSE_PROJECT_NAME` for each installation sharing an engine; it also namespaces extension cleanup. The `peek-data` volume stores SQLite and its encryption key. Local `data/` is not imported.

Web listens on all interfaces. Set `PEEK_BIND_ADDRESS=127.0.0.1` for host-only access, or use a specific LAN address. On another device open `http://<server-lan-ip>:3000/screens/default`. For a custom hostname set `PEEK_ALLOWED_HOSTS=peek.home,peek.local`. Settings writes require a matching browser Origin; these checks do not authenticate users.

```sh
docker compose ps
docker compose logs --tail=100 web worker extension-runner
docker compose down  # Stop all processes; keep data
```

## Local development

Requirements: Bun **1.4.2**, Node.js **24**, a running Linux Docker engine with resource limits and seccomp, and a local filesystem for SQLite.

```sh
bun install --frozen-lockfile
bun run official:build
bun run extensions:images
bun run db:migrate
bun run db:seed  # Optional: insert static demo cards once
```

Run each service in its own terminal:

```sh
bun worker
bun run extensions:runner
bun dev
```

`bun dev` is loopback-only. `bun run build` builds the official packages and web app; `bun start` starts the production web server. Keep both worker and runner running. A stopped runner prevents all connections and scenarios, including official ones, from executing. Settings shows its availability and instance errors.

The default database is `data/peek.sqlite`. To use another location, set the same absolute `PEEK_DATABASE_PATH` in all terminals. Demo seeding is opt-in and idempotent: it creates one meeting and three deadlines, without creating connections or scenarios. Expired demo cards are never reseeded automatically.

## Connections and scenarios

1. In **Connections**, choose **Add connection** on iCalendar.
2. Enter a name, profile, time zone, refresh interval and the provider's **HTTPS ICS subscription URL**. A calendar sharing web page is not an ICS feed. Token-bearing subscription URLs are supported.
3. Save and inspect the last successful run or error. **Run now** queues an immediate attempt; it does not claim the connection succeeded.
4. In **Scenarios**, create Meetings or Deadlines and select one or more connections. Multiple scenarios share snapshots without downloading the same calendar separately.

The same forms also support installed external packages. **Settings → Extensions** manages uploads, HTTPS release links, permission review, package removal and rollback. The **Official** badge matches the exact package content supplied with this installation; an uploaded package's author or ID alone cannot confer that status.

Bundled defaults are installed once. Removing an unused official package does not cause it to reappear on restart. Package updates are explicit: upload the newly built `.peek` archive and use the normal migration/rollback path. Rebuilding the application does not silently update installed packages.

Scenarios configure visibility lead time, urgency and retention in minutes, and an optional case-insensitive title filter. Lead time must exceed urgency; retention is at most 24 hours. Meetings omit all-day events and expire at the earlier of meeting end and configured retention. Deadlines use the event's start time, or the end of its start date for all-day events.

Each scenario replaces only its own cards and persists its next-run timestamp atomically. Event identity includes the connection, so identical provider IDs in different calendars remain distinct. Input publications and configuration changes schedule re-evaluation. Disabling or deleting a scenario removes its cards. Failed executions retain prior cards until expiry and retry after 60 seconds. Stale results from edited or deleted instances are rejected.

### iCalendar behavior

- Public HTTPS, port 443, up to four redirects. DNS answers are validated at each hop and the TLS connection is pinned to a public address. Private/loopback/reserved addresses, URL credentials and interactive login are unsupported.
- Fifteen-second fetch deadline and 10 MiB response limit. Every run downloads and re-expands the feed; no full-feed cache is stored in the SDK's bounded instance state.
- `node-ical` and Luxon run inside the connection's Node container. RRULE, EXDATE, RECURRENCE-ID, TZID, cancellation, floating dates and DST are supported. Each connection selects its time zone; explicit event TZID values take precedence.
- Expansion covers two days in the past and 90 days ahead, with at most 10,000 occurrences. Secondly recurrence is rejected. Titles and locations are capped at 1,000 characters.
- Successful snapshots remove missing/cancelled events. Failed runs retain the previous snapshot. Editing a connection clears its state and snapshot before a fresh run.
- The common runner supports eight active connections and four scenarios concurrently. See [extension limits](docs/extensions.md) for publication, card and resource limits.

Subscription URLs are encrypted and never returned by the API. When editing, keep credential replacement unchecked to retain the saved URL. A connection referenced by a scenario cannot be deleted.

## Profiles, screens and appearance

Profiles provide a name and one of twelve colors. **Shared** is a localized system profile. A scenario may select another profile's connection; its cards belong to the scenario's profile. Renames and color changes reach screens without re-fetching sources. Referenced profiles cannot be deleted.

Create independent displays in **Screens**. Each has an editable, unique URL ID such as `family-tv`, a display name, appearance and scale. IDs accept 1–64 lowercase Latin letters, digits and single hyphens; `new` is reserved. The default screen is `/screens/default`.

Choose **All profiles**, or select specific profiles including Shared. An empty selection produces an empty display. Source warnings follow the selected scenarios' bindings. Saved changes arrive over SSE; deleting a screen invalidates its URL. Screen selection is organizational, not access control.

General settings control the app theme and English/Russian interface language. User content is not translated. Screen clocks use `PEEK_TIMEZONE`, then `TZ`, then the server timezone. Set these consistently for web and worker, for example `PEEK_TIMEZONE=Europe/Moscow docker compose up --build --wait`. iCalendar's time zone is a separate package setting for interpreting floating event times.

## Backup and restore

Stop **all three processes** before copying SQLite and its key. Compose's volume contains the full installation:

```sh
docker compose down
docker compose run --rm --no-deps -T migrate tar -C /data -czf - . > peek-backup.tar.gz
docker compose up --wait
```

Keep the archive private: it contains encrypted credentials and their decryption key. Restore with the original installation stopped:

```sh
docker compose -p peek-restored run --rm --no-deps -T migrate tar -C /data -xzf - < peek-backup.tar.gz
COMPOSE_PROJECT_NAME=peek-restored docker compose up --build --wait
```

Continue using the restored project's name. Without the original `secret.key`, credentials cannot be decrypted. Alternatively configure the same base64-encoded 32-byte `PEEK_ENCRYPTION_KEY` in every process. Never replace the key for an existing database. `docker compose down --volumes` deletes installation data.

## Checks and SDK development

```sh
bun run test
bun run typecheck
bun run build
bun run extensions:images
PEEK_TEST_DOCKER=1 bun test tests/extensions-docker.test.ts
bun run extensions:npm-smoke
```

Tests cover scheduling boundaries, bindings, profile ownership, persistence, destructive MVP reset, encrypted secrets, stale publications, package provenance, recurrence/DST and container execution. The official Docker integration test uses a deterministic transport fixture; it exercises the bundled parser and both official scenarios without contacting a calendar account. CI also checks Compose startup, restart and backup restoration.

UI regressions run in CI against a separate database. To run them locally, build the app,
start it with an absolute temporary `PEEK_DATABASE_PATH`, then run
`uv run --with playwright==1.64.1 python -m playwright install chromium` and
`uv run --with playwright==1.64.1 python tests/ui_smoke.py http://127.0.0.1:3217`
(use your server's port). The check creates/deletes test profiles and screens and changes
locale/theme; never point it at your household database. Extension UI uses API fixtures.

Editors lock during saves and warn before leaving with unsaved changes. Cancel explicitly
discards a draft. Back/Forward warnings require a browser with the Navigation API;
older browsers still warn for links and reloads.

See [Extensions](docs/extensions.md) for the public SDK, manifests, package lifecycle and npm releases. The [MVP plan](docs/mvp-plan.md), [design decisions](docs/design.md), and [future ideas](docs/future-ideas.md) contain the product background. A distribution license has not been selected yet.

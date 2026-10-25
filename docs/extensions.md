# Peek extensions: SDK v0.1

## Architecture

The monorepo contains independently versioned `@peekapp/sdk` and `@peekapp/cli` npm
packages, the private `@peek/extensions` package manager/storage implementation,
and `apps/extension-runner`. No additional GitHub repositories are required.

The SDK supplies two APIs: scenarios compute cards from explicitly selected data;
connections implement arbitrary service-specific logic using compatible Node.js
libraries. A package is never imported into the web or main worker process.
The manifest, settings UI, data schemas, version constraints and lifecycle form
the common platform interface. Connection authors define new data contracts.

Official iCalendar, Meetings and Deadlines live in `extensions/official/` as standalone
workspace packages. They depend on the public SDK and ordinary npm libraries, not
on Peek's database, core or worker. `bun run official:build` builds them with the
public CLI and bundles them into `extensions/dist/official.peek`.

Migration queues the bundled defaults once; the runner activates them through the
same installation transaction as an uploaded package. All instances live in
`extension_instances`, all inputs are connection snapshots, and all execution uses
containers. The web process and screen worker never import extension handlers.
Schema v12 is the current development schema. Older development databases are
reset when migration runs; there is no compatibility layer for previous extension
formats or SDK names.

An installation receipt stores each bundled package's content digest. Only an
installed package matching that digest receives the Official badge. Author metadata
and package IDs cannot grant it. Removed defaults stay removed across restarts;
updates use the normal explicit upload/review/migration/rollback flow. Application
rebuilds do not silently upgrade installed packages.

## Run locally

```sh
bun install --frozen-lockfile
bun run official:build
bun run db:migrate
bun run extensions:images
# Required alongside the web app and screen worker:
bun run extensions:runner
```

Use the same absolute `PEEK_DATABASE_PATH` for all processes. The extension runner
requires a running Linux Docker engine with memory, CPU, PID and seccomp controls.
The runner reports unavailable and refuses execution if these checks fail.

With Compose:

```sh
docker compose up --build --wait
```

Compose builds both runtime images automatically; the image preparation services
exit successfully. The runner is required for official and external packages.
Only `extension-runner` receives the Docker socket. It shares the database volume
with Peek but never mounts it into extension containers. Set `PEEK_DOCKER_SOCKET`
when the host socket differs from `/var/run/docker.sock`. Set a unique
`COMPOSE_PROJECT_NAME` for each deployment sharing one Docker engine; this also
namespaces cleanup of extension containers. Stop the extension runner too when
backing up/restoring the database. Installed packages, operation journal, instance
state and rollback data are stored in SQLite; back up the encryption key as usual.

## Build and install an example

```sh
bun run extensions:build
node packages/cli/dist/cli.mjs pack extensions/examples/connection /tmp/source.peek
node packages/cli/dist/cli.mjs pack extensions/examples/scenario /tmp/scenario.peek
node packages/cli/dist/cli.mjs bundle /tmp/example.peek /tmp/source.peek /tmp/scenario.peek
```

Open **Settings → Extensions**. Upload the bundle, review every package and its
permissions, and accept installation. The runner activates the whole set after
validation. Add a connection for Sample source; create a Sample cards scenario
and explicitly select that connection. The screen displays the returned cards.

HTTPS release links are also supported. Fetches reject private/reserved DNS
answers, pin the selected address, validate redirects, and limit size/time.
Required dependencies are fetched only from explicit HTTPS URLs with SHA-256
integrity; otherwise supply them in the bundle. Uploads are gzip-compressed JSON
archives with UTF-8 files, not executable installation scripts or tar paths.

## Manifest

```json
{
  "format": 2,
  "sdk": "^0.1.0",
  "id": "author/my-scenario",
  "version": "0.1.0",
  "kind": "scenario",
  "name": "My scenario",
  "description": "Show interesting items",
  "author": "Author name",
  "entry": "index.mjs",
  "settings": { "type": "object", "properties": {} },
  "permissions": {},
  "inputs": {
    "items": {
      "contract": "author/items",
      "version": "^1.0.0",
      "multiple": true
    }
  },
  "contracts": [{ "id": "author/items", "version": "1.0.0", "schema": { "type": "array", "items": { "type": "string" } } }]
}
```

A connection uses `kind: connection`, `provides` instead of `inputs`, and can
specify a separate `secrets` schema. A provided dataset declares `id`, semantic
`version`, and `schema`. A dependency may add `url` and `sha256`. A scenario without
inputs is allowed. Optional inputs use `optional: true`.

Schemas use a bounded JSON Schema draft-07 subset: primitive/object/array types,
properties, required, items, enum/default, additionalProperties, numeric bounds,
and string/array length bounds, bounded `oneOf`, and the built-in `date` and
`time-zone` string formats. Schemas are capped at 64 KB and depth 12;
`oneOf` has at most eight branches. References (including local/remote `$ref`),
regular expressions and other combinators are unsupported. Forms render scalar controls; structured values use JSON input.
The host validates submitted settings and every published snapshot.

## Reusable contracts and author workflow

A **connection extension** is installed code; a **configured connection** is one
instance with its own settings, credentials and state. A **scenario extension** is
installed code; a **configured scenario** has selected inputs, settings and state.
The UI calls them Connections and Scenarios; users do not manage contracts.

1. Reuse a contract whose semantics fit. The public Events definition and TypeScript
   types are exported by `@peekapp/sdk/contracts/events`. Its complete field and
   time-window semantics are documented in [the SDK README](../packages/sdk/README.md#public-events-contract).
2. Put the canonical `{ id, version, schema }` JSON in `provides.<dataset>` for each
   produced dataset. A connection can publish several datasets and contracts.
3. Consumers include the same definitions in `contracts` and reference their IDs
   and semver ranges in `inputs`. Use `multiple: true` to accept selected snapshots
   from several independently implemented sources. There is no provider package
   reference in an Events-only scenario.
4. Package with `peek pack`, install, create configured connections, then explicitly
   select them when creating the scenario. Installing a dependency neither creates
   an instance nor grants a scenario access to it. Scenarios may have no inputs.

For a standard-contract example, package `extensions/examples/events-connection`
(a synthetic birthday source) and `extensions/examples/events-scenario` (a simple
list of selected Events snapshots), using the same commands as the messages pair
above. These are fixtures, not service integrations. The scenario also accepts
any other provider of the same Events definition, including official iCal.

For a community contract, see `extensions/examples/contracts/messages.json` and
`messages.ts`: the connection and scenario examples embed the same definition.
The dataset is a complete ordered list of up to 100 display messages; replacement
removes omitted messages. A community author can distribute such JSON, types and
semantic documentation in an ordinary npm package or source repository. Authors
copy/export the JSON into their manifests; Peek needs no new code or registry
service. A new contract does not work with consumers expecting a different ID.
Namespaces identify contracts; they do not verify ownership or authorship.

Definitions travel inside immutable package archives and are pinned locally in
SQLite `extension_contracts` at successful installation, keyed by ID and exact
contract version.
The first installed community definition establishes that local version; consumers
can establish it before any provider is installed. Every later producer and consumer
must supply the same schema. Object key order is ignored; array order and schema
annotations are significant. Conflicting definitions fail installation atomically,
including conflicts within a bundle. Pins survive uninstall and rollback, so a
version cannot silently acquire a different schema. SDK Events v1 is additionally
checked against its built-in canonical definition even on a fresh installation.

For format 2, a binding must satisfy both the input semver range and an exact
version included in the consumer's definitions. A consumer can carry several
versions. Unknown future minor versions require adding their canonical definition
and shipping a consumer update; semantic-version claims alone cannot establish
schema agreement. Peek validates every published dataset using the pinned schema.
This intentionally avoids trying to prove structural schema compatibility.

Only format 2 manifests with `connection` or `scenario` kinds are accepted. Every
input requires a canonical definition; ID/range matching never bypasses that check.
Rebuild older development packages with the current SDK and CLI.

Official iCal, Meetings and Deadlines use `peek/events`. Official code uses the
same SDK, validation, packaging and restricted execution API as community code.
Scenarios receive only selected snapshots, never connection credentials or state.
Package upgrades still validate settings, credentials and bindings atomically,
and rollback restores the previous package/configuration snapshot.

## Security and permission boundaries

- A scenario runs as an unprivileged user in a fresh container, without networking,
  credentials, database or host mounts. Results are data rendered by Peek, never
  extension-supplied browser code.
- Each connection connection has a separate container. Only that connection's
  credentials and JSON state enter its process. State persists through the SDK;
  its writable `/tmp` is temporary and capped at 32 MiB.
- Root filesystems are read-only; Linux capabilities are dropped; no-new-privileges,
  seccomp, CPU, memory and PID limits apply. The trusted runner constructs Docker
  arguments; packages cannot provide images, Dockerfiles, host paths or privileges.
- `permissions.internet: true` grants public TCP/UDP egress. This is broad internet
  access, not a domain allowlist. It can disclose data or misuse credentials within
  granted service permissions. A warning does not make a connection safe.
- `permissions.local` accepts explicit IPv4 address/port pairs. A separate trusted
  gateway enforces filtering in the shared network namespace; the extension cannot
  change it. Docker networks, loopback, link-local/metadata and reserved addresses
  remain blocked. IPv6 is blocked in v0.1, including local IPv6 grants.
- Containers reduce risk, but share the Docker host kernel; this is not a guarantee
  against kernel/container-runtime exploits. Keep Docker and the host updated.
- The existing trusted-LAN Settings policy applies to package installation. This
  release does not introduce user accounts, admin roles or public deployment.

Default limits: scenario 10 seconds / 128 MiB / 32 processes; connection 512 MiB /
64 processes; each container 0.5 CPU; 8 MiB per protocol message; 1 MiB instance
state; 1,000 cards; 16 MiB compressed bundle / 32 MiB expanded. Publications are
limited to one per 100 ms. Four scenario executions and eight connections can run concurrently; persistent connections do not consume scenario slots. Raw extension stdout must follow the protocol; console
logs and stderr are not forwarded to avoid exposing credentials.

## Updates, removal and recovery

Every uploaded/downloaded external package is **unreviewed**. Author metadata and
hashes do not confer official or reviewed status. This release has no public
catalog, package signing infrastructure or moderation service.

One version per package ID is active. Installation review includes transitive
permissions. Version conflicts block installation. Changing contents without
changing version is rejected. Updates are explicit; no background auto-update.
The runner pauses affected connections, runs migrations without credentials or
network, then commits all package/settings changes in one transaction. Concurrent
configuration changes invalidate the commit. Saved credentials must validate against
updated secrets schemas before commit; incompatible updates fail with the instance
name and an instruction to update credentials first. Migration code never receives
credentials. If the old schema cannot accept the new credentials, use an intermediate
package version accepting both shapes before the final upgrade.

The operation journal survives a restart. Configuration generations reject results
from changed, disabled or deleted instances. New input data increments a separate
revision: an in-flight scenario may finish, then one coalesced follow-up uses the
latest snapshots. Connection state survives name, profile and enabled changes;
actual settings or credential changes deliberately reset state and snapshots.
Object key ordering alone does not count as a configuration change.

The previous package set and configuration/state snapshot form one rollback point.
Rollback is explicit and restores saved configuration/state; later edits can be
lost. New instances must be removed first. Deleting an instance clears the rollback checkpoint, so deleted credentials are not retained there.
References are revalidated, and an incompatible rollback is rejected atomically.

Deleting a scenario instance removes its cards/state but preserves its packages
and connections. A package with instances or dependents cannot be removed.
An unused auto-installed dependency is offered for manual cleanup. Removing a
connection deletes its local secret/state, not the provider-side authorization.

## npm releases

`@peekapp/sdk` and `@peekapp/cli` publish from this repository, with separate versions.
The manually dispatched npm workflow builds, tests and packs before publishing.
Releases use npm trusted publishing from `peekapp/peek`, workflow
`npm-release.yml`, environment `npm`. No npm token is stored in GitHub.

To release, bump the selected package version in `packages/sdk/package.json` or
`packages/cli/package.json`, run `bun install` to refresh the lockfile, and push
the change to `main`. In GitHub Actions, select **npm release → Run workflow**,
choose `sdk` or `cli`, and enter the exact version. Leave **dry_run** enabled
for validation; disable it to publish. Each version can only be published once.
Only `main` can publish; SDK and CLI versions are independent.
No npm publication is performed by installing/developing Peek.

`bun run extensions:npm-smoke` packs both packages, installs the tarballs in a clean
project, imports SDK entrypoints, scaffolds an extension and builds it through the
installed CLI. This detects accidental dependencies on monorepo source files.

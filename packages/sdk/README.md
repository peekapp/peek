# @peekapp/sdk

Public TypeScript contracts for Peek extensions. Requires Node.js 24 or newer.

```sh
npm install @peekapp/sdk
```

```ts
import { defineScenario } from "@peekapp/sdk/scenario";

export default defineScenario({
  evaluate({ now }) {
    return {
      cards: [
        {
          id: "hello",
          title: "Hello Peek",
          visibleFrom: now,
          targetAt: now + 60_000,
          expiresAt: now + 60_000,
        },
      ],
      nextRunAt: now + 60_000,
    };
  },
});
```

Connections import `defineConnection` from `@peekapp/sdk/connection`. Their `run`
receives settings, credentials for one connection, JSON state, an AbortSignal,
and `publish`. Return a complete dataset snapshot, or publish snapshots while
maintaining a connection. Every update replaces all declared datasets; omitted
records disappear. Store cursors in `state`. `nextRunAt: null` means no scheduled
restart after a successful completion; use a future UTC millisecond timestamp
for periodic execution. A process restart resumes enabled connections from their
last persisted state. A scenario runs when inputs/configuration change or its
scheduled timestamp is reached.

Scenario inputs are explicitly bound connection snapshots. Connections declare
versioned, namespaced contracts in `peek.json`; authors may introduce new contracts
without changing Peek. The SDK does not supply a list of allowed services.

The SDK is an API, not a sandbox. Installed extensions execute in Peek's restricted
containers. Scenarios have no network or credentials. Connections may use ordinary
Node.js libraries and TCP/UDP connections within their granted network access.

`migrate({ fromVersion, settings, state })` is optional on either definition.
It returns the next settings/state without credentials or network access.
Migrations cannot write platform tables. A failed migration leaves the previous
installation active.

See the repository's `docs/extensions.md` for manifests, limits, deployment,
installation, upgrades, and the supported schema subset. SDK and CLI have their
own npm versions; they are maintained in the Peek monorepo.

## Public Events contract

```ts
import { eventsContract, type Event, type Events } from "@peekapp/sdk/contracts/events";
```

`eventsContract` is the canonical JSON definition of `peek/events@1.0.0`.
Put it under a connection's `provides.events`, or in a scenario's `contracts`
array with `inputs.events: { contract: "peek/events", version: "^1.0.0", multiple: true }`.
New manifests use `format: 2`. Export the JSON to `peek.json` during authoring;
Peek never executes a contract definition. The contract version is independent
of your package version. See `extensions/examples/events-connection` and
`events-scenario` in the repository for a complete producer and consumer.

A snapshot is `{ from, to, events }`. `from` and `to` are Unix milliseconds,
covering `[from, to)`. Producers include every occurrence starting within that
window and any occurrence still ongoing at `from`. They expand recurrence and
apply exceptions/cancellations before publishing. Consumers must not infer that
an empty snapshot means there are no events outside the advertised window.
Each publication completely replaces the previous snapshot: omitted occurrences,
including those outside the new window, disappear. Consumers replace their cards
accordingly. IDs must be unique within the snapshot.

| Field | Meaning |
| --- | --- |
| `id` | Stable occurrence ID within one configured source, including when moved or renamed. Recurring occurrences have different IDs. |
| `title` | Nonempty display title. |
| `kind: "timed"` | `startAt` and optional exclusive `endAt` are Unix milliseconds, never seconds. Instants are independent of display timezone. Missing end means a point occurrence. |
| `kind: "all-day"` | `startDate` and optional exclusive `endDate` are ISO calendar dates (`YYYY-MM-DD`), with a required IANA `timeZone`. Missing end means the next local calendar date. No midnight-UTC timestamp stands in for a date. |
| `location` | Optional plain-text location. |

Ends must follow starts, and `from` must precede `to`. These cross-field semantics,
coverage completeness and stable identity are producer obligations; the canonical
schema checks representation, bounds, valid dates and timezone names. A scenario
combining sources scopes identity by `[snapshot.connectionId, event.id]` (hash the
pair if needed). It never identifies a source by package ID. “Tomorrow” is the next
calendar date in the event's explicit zone for all-day occurrences, not `now + 24h`.
Timed-event display uses the display's chosen timezone. Official Meetings skips
all-day events; Deadlines targets the end of their first local date, including DST.

## Extension icons

Optionally add `"icon": "assets/icon.svg"` to `peek.json` and place your artwork
at that exact path. `peek check` and `peek pack` include and validate it; missing,
empty, oversized, or differently named icon assets are rejected. SVG is the only
supported format, with a maximum of 32 KiB of UTF-8 text. Existing packages without
icons keep working with a generic scenario or connection symbol. Hosts predating
icon support must be upgraded before installing packages with this asset.

Use a self-contained, static SVG with a square `viewBox`, explicit colors and a
transparent background. Design for both light and dark themes at 20px and 32px.
Convert text to paths; do not depend on external fonts, images, styles or scripts.
Peek preserves aspect ratio and displays SVG only in isolated image/mask contexts,
never inline HTML. Optional `"iconColor": "original"` (the default) preserves artwork
colors. Use `"iconColor": "theme"` for monochrome symbols: the SVG's alpha silhouette
is filled with Peek's foreground color and follows theme changes automatically.
Use transparent backgrounds; opaque backgrounds become solid squares. Theme mode
ignores RGB colors and preserves transparency, so it flattens multicolor details.
An omitted icon still uses the generic fallback regardless of `iconColor`. Malformed/unrenderable images use the fallback;
packaging validates the asset envelope, not SVG syntax or artwork quality.

The package owns its icon: configured instances inherit it throughout settings.
There are no per-instance overrides or dashboard icons. Assets participate in
package digests, installation review, upgrades and rollback; changing an icon
requires a new package version. Official package artwork also reaches existing
installations through explicit upgrades, never a silent default replacement.
See `extensions/examples/connection` for a working authoring example.

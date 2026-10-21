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

Integrations import `defineIntegration` from `@peekapp/sdk/integration`. Their `run`
receives settings, credentials for one connection, JSON state, an AbortSignal,
and `publish`. Return a complete dataset snapshot, or publish snapshots while
maintaining a connection. Every update replaces all declared datasets; omitted
records disappear. Store cursors in `state`. `nextRunAt: null` means no scheduled
restart after a successful completion; use a future UTC millisecond timestamp
for periodic execution. A process restart resumes enabled integrations from their
last persisted state. A scenario runs when inputs/configuration change or its
scheduled timestamp is reached.

Scenario inputs are explicitly bound connection snapshots. Integrations declare
versioned, namespaced contracts in `peek.json`; authors may introduce new contracts
without changing Peek. The SDK does not supply a list of allowed services.

The SDK is an API, not a sandbox. Installed extensions execute in Peek's restricted
containers. Scenarios have no network or credentials. Integrations may use ordinary
Node.js libraries and TCP/UDP connections within their granted network access.

`migrate({ fromVersion, settings, state })` is optional on either definition.
It returns the next settings/state without credentials or network access.
Migrations cannot write platform tables. A failed migration leaves the previous
installation active.

See the repository's `docs/extensions.md` for manifests, limits, deployment,
installation, upgrades, and the supported schema subset. SDK and CLI have their
own npm versions; they are maintained in the Peek monorepo.

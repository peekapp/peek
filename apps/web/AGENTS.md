<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI consistency

Read `DESIGN.md` before any UI change. All settings routes, including Extensions,
render through `Settings`. Compose lists and editors from `components/settings/layout.tsx`;
use `ProfileLabel` / `ProfileIdentity` everywhere a profile is displayed. Extend
shared components when a pattern needs to change instead of styling individual pages.
Verify affected lists, create/edit flows, empty/error states, narrow viewports,
and theme compatibility.

## Styling architecture

- Tailwind classes live inside components; use CVA for variants and cn() to merge.
- globals.css contains only Tailwind setup, semantic theme tokens and global base
  rules. No component selectors, page styles, or global data-slot overrides.
- Use existing shadcn primitives. Extend their variants rather than overriding
  their internals from a page or adding a parallel implementation.
- Reuse SettingsPage, SettingsNavigation, SettingsHeading, SettingsGrid,
  SettingsCard (screens only), SettingsList, SettingsRow, SettingsRowDetails, EditorForm, EditorSection, EditorActions, SettingsField,
  FormFeedback, LoadingState, ErrorState and SettingsEmpty.
- Keep dynamic inline styles only for runtime values (profile colors, screen
  scale). Static styling belongs in Tailwind. Use semantic colors for every theme.
- Verify production build, types, tests and browser layouts in light/dark themes
  at wide/narrow sizes using isolated data. Include dialogs.

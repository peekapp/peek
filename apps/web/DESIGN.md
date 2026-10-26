# Peek UI contract

Peek is a quiet, glanceable household dashboard. Settings share a compact, predictable
visual language. Existing theme tokens and typography remain the source of truth.
Consistency is implemented in components, not achieved by copying classes.

## Component layers

- `components/ui/`: shadcn/Radix primitives, variants, focus and disabled states.
- `components/settings/layout.tsx`: product compositions built from those primitives.
- Feature components: data, behavior, and content; no alternative page anatomy.
- `components/profile-label.tsx`: identity shared by settings and the dashboard.

## Required compositions

| Purpose                 | Component                        | Contract                                                                    |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| Settings navigation     | `Settings`                       | AppShell sidebar for resources; General/Extensions tabs; one centered compact page h1 in the top bar                             |
| Collection layout       | `SettingsCollection`             | Owns the 16px gap between toolbar and content across all resource lists     |
| Collection toolbar      | `SettingsToolbar`                | Search input and primary action; on narrow screens, full-width action above full-width search; filters by name with a shared no-results state |
| Section heading         | `SettingsHeading`                | h2, description below, primary action to the right; wraps on narrow screens |
| Screen collection | `SettingsGrid` + `SettingsCard` | Preview cards in two equal columns, one on small screens, 24px gap |
| Text resource collection | `SettingsList` + `SettingsRow` | Profiles, connections, and installed extensions use shadcn Item rows in one bordered list with separators; metadata left, actions right, stacked on mobile |
| Screen card           | `SettingsCard`                   | Title, description, optional content, optional actions, optional preview    |
| Scenario collection | `SettingsDataTable` | shadcn Table with TanStack Table; clickable rows with name (no subtitle), health as the sole status (Paused when disabled), avatar-only profile (name in tooltip), and a trailing three-dot Edit/Enable-or-Disable/Refresh-cards/Delete menu with icons; column headers are visible on desktop; keyboard focus remains visible without a mouse-click row ring; health dot/text with explanatory tooltip containing the last successful run (relative and full date); manual card refresh in the menu; no connections or troubleshooting; errors stay visible; separate bordered cards below 1024px (name and primary health above, profile/menu on the page background below a divider); existing search and empty states |
| Connection/list status | `SettingsRow` status + `SettingsRowDetails` | Connection sync-health badge beside the name (Connected, Waiting for sync, or Needs attention); connections are always active, only scenarios have enable/disable controls; profile, connections and errors visible; last successful update and manual refresh in an expandable Troubleshooting disclosure; no next-update timestamp; package artwork through ExtensionIcon |
| Empty collection        | `SettingsEmpty`                  | Shared shadcn Empty composition with next-step copy                         |
| Editor heading          | `EditorHeader`                   | Back link, shared section heading, optional description/action              |
| Editor section          | `EditorSection`                  | Common field spacing and section typography                                 |
| Editor actions          | `EditorActions`                  | Save first, ghost Cancel second, destructive action at the end              |
| Labeled control         | `SettingsField` / shadcn `Field` | Label above control; hint below; linked IDs                                 |
| Profile                 | `ProfileLabel`                   | Localized name and the same 24px colored initials avatar, including selectors, rows and cards        |
| Unsaved profile preview | `ProfileIdentity`                | Same identity component, with draft name/color                              |
| Confirmation            | `ConfirmAction` / `DeleteButton` | Red text trigger, solid destructive confirmation in Radix AlertDialog; never native confirm() |

Use one-column forms for short editors. A screen editor can add a preview aside:
this is a functional difference, not a separate heading, field, or action style.
The display dashboard has a different information density from settings but shares
identity, theme tokens, controls, and accessible states.

AppShell owns the logo header, resource links with icons, and Settings footer.
Use it in Settings. / redirects to /screens. Resources live at
/screens, /scenarios, /connections and /profiles; /settings is only General and
Extensions. Screen editors use /screens/new and /screens/[id]/edit; display URLs
(/screens/[id]) remain fullscreen. Legacy settings resource URLs redirect, preserving
query parameters.

## Styling

Use semantic theme variables, the existing font, and a spacing rhythm of 8/16/24/32px.
Use shared `card`, `border`, `muted-foreground`, `accent`, `primary` and `secondary`
colors across settings and dashboard components; do not add page-specific color tokens.
Keep appearance in Tailwind utilities inside components. Model variants with CVA
and combine classes with cn(). `globals.css` is limited to Tailwind imports,
theme palettes, semantic tokens, CSS variables and global base/accessibility rules.
Never put component/page selectors or overrides of shadcn internals there, or move
those selectors to another global stylesheet. Extend the primitive or shared
composition instead. Reuse SettingsPage, SettingsTopbar, SettingsTitle,
SettingsNavigation, EditorForm (including its preview variant), EditorGrid,
FormFeedback, LoadingState and ErrorState alongside the compositions above.
Dynamic inline values are reserved for runtime profile colors, screen scale, and validated extension mask-image URLs.
Keep profile colors
in `@peek/core/colors`; never create another avatar/color implementation.
Profile avatars use a solid profile-color fill without a border and dark initials
through the profile-foreground token in every theme, so colors stay easy to scan.

Use Button, Input, Textarea, SettingsSelect, Field, Alert, Empty, Badge and dialogs
from the existing component library. Add missing shadcn primitives through the CLI,
then verify aliases and dependencies; never accept an accidental `cn` npm dependency.

## Change workflow

1. Identify the existing composition before writing page markup.
2. Change the shared composition first; migrate all matching consumers.
3. Run web typecheck and relevant tests. Inspect lists, create/edit screens, dialogs,
   long names, loading/errors, empty states, both locales, and narrow layouts.
4. Preserve save/delete behavior, keyboard access, and selected-profile identity.

## Audit completed in October 2026

Kept preview cards for Screens; unified Profiles, Scenarios, Connections and installed packages into shared shadcn Item lists; brought Extensions
inside the settings shell; unified General heading placement; shared editor headers,
sections and actions; shared profile identities across settings and dashboard;
replaced native extension confirmations and raw schema textareas. Catalog navigation
and screen previews remain purpose-specific.

## Verification

Run `bun run build`, `bun run typecheck`, and `bun run test`. Browser checks must
use a separate absolute `PEEK_DATABASE_PATH`. Exercise actual profile/screen saves,
confirmation cancellation and deletion, catalog navigation, loading/error/empty
states, long names, both locales and light/dark palettes at desktop/mobile widths.
An unavailable extension runner does not validate extension execution: use isolated
API fixtures for its UI and report that limitation separately.

Page titles live in AppShell’s top bar at normal text size. Collection pages use
SettingsToolbar instead of introductory headings/descriptions. SettingsPage uses
16px padding on mobile and 24px on desktop, with no centered width cap.

Loading never replaces collection toolbars or editor back navigation. Render these
controls immediately; keep catalog-dependent actions visible but disabled until ready.
Use LoadingState (shadcn Skeleton) for pending collections and its editor layout for
forms, with localized screen-reader status text. Keep existing content during refresh
and replace initial skeletons with error feedback when a request fails.

New screen/profile editors render from defaults immediately and keep their draft mounted
when data arrives. Only fetched profile choices use the fields layout of LoadingState.

Editors keep their loaded record and schema stable until save or navigation; do not
poll these out from under a draft. Catalog/status lists and independent profile choices
may refresh without remounting editors or resetting search and installation inputs.
Load extension schemas and profile choices independently.

Text resource loading uses `LoadingState layout="list"`; screen loading retains the card grid. Keep errors visible in rows and connection troubleshooting expandable. Preserve real title links, separate actions, and wrapping names/metadata without horizontal scrolling.

## Extension identity

ExtensionIcon renders package-supplied SVG as an isolated image with contain sizing.
The manifest’s optional iconColor defaults to original; theme uses the asset’s
alpha mask filled with semantic foreground color. Both modes preserve transparency
and use the same image-error fallback; never inject package SVG into the DOM. Standard icons are 32px in
lists, catalog choices, installation review and editor headings; compact icons
are 20px in ExtensionLabel beside connection choices and references. Icons are
decorative beside visible names. Missing or broken images use WorkflowIcon for
scenarios and PlugIcon for connections. Both themes use the same asset.
SettingsRow and EditorHeader expose a shared media slot; keep media beside text
on mobile while actions stack. Profiles retain their own identity composition.

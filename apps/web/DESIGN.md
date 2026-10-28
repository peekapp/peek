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
| Text resource collection | `SettingsList` + `SettingsRow` | Installed extensions use shadcn Item rows in one bordered list with separators; metadata left, actions right, stacked on mobile |
| Screen card           | `SettingsCard`                   | Title, description, optional content, optional actions, optional preview    |
| Scenario collection | `SettingsDataTable` | shadcn Table with TanStack Table; clickable rows with name (no subtitle), health as the sole status (Paused when disabled), avatar-only profile (name in tooltip), and a trailing three-dot Edit/Enable-or-Disable/Refresh-cards/Delete menu with icons; column headers are visible on desktop; keyboard focus remains visible without a mouse-click row ring; health dot/text with explanatory tooltip containing the last successful run (relative and full date); manual card refresh in the menu; current stored card count independent of screen visibility; no connections or troubleshooting; error details stay in the health tooltip; separate bordered cards below 1024px (name and primary health above, generated card count/profile/menu on the page background below a divider); existing search and empty states |
| Profile collection | `SettingsGrid` + `ProfileCard` | Vertical cards in a responsive grid, at least four columns from 1024px; 64px shared avatar with name below, then compact icon/count pairs with hover/focus tooltips for connections and scenarios; whole-card edit link and separate Edit/Delete menu with confirmation; system profiles cannot be deleted; no header or individual resource names |
| Connection collection | `SettingsDataTable` | Same responsive table/cards, clickable names, avatar-only profiles and health dot/tooltip as scenarios; Connected, Waiting for sync, Needs attention or Paused; last update in the health tooltip; Edit/Refresh data/Delete menu, no enable/disable; saved scenario usage count (including paused scenarios, each counted once) in the same column/mobile metadata position as scenario card counts; error details stay in the health tooltip |
| Empty collection        | `SettingsEmpty`                  | Shared shadcn Empty composition with next-step copy                         |
| Editor heading          | `EditorHeader`                   | Back link, shared section heading, optional description/action              |
| Extension editor panels | `EditorPanel` + `Card variant="settings"` | Scenarios and connections start with one shared identity panel: package icon/name and Enabled switch, labeled Name/Profile fields, saved health and last-success/update time, scenario card count and visible errors. Name/profile/enabled save together; other blocks have their own Save button. Existing records save only that panel, in place; unrelated drafts remain guarded. A new record needs a complete valid first save. Credentials remain an atomic group because stored secrets are never sent back to the browser. Editor top bars use clickable shadcn breadcrumbs with the saved instance name, updating after rename; omit the redundant back link and separate heading. Extension installation/review uses the same Card variant. |
| Editor section          | `EditorSection`                  | Common field spacing and section typography                                 |
| Editor actions          | `EditorActions`                  | Save first, ghost Cancel second, destructive action at the end              |
| Labeled control         | `SettingsField` / shadcn `Field` | Label above control; hint below; linked IDs                                 |
| Profile                 | `ProfileLabel`                   | Localized name and the same colored initials avatar (24px inline, 64px on profile cards), including selectors, rows and cards        |
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

Text resource loading uses `LoadingState layout="list"`; screen loading retains the card grid. Keep resource-row error details in the health tooltip and connection troubleshooting expandable. Preserve real title links, separate actions, and wrapping names/metadata without horizontal scrolling.

## Extension identity

ExtensionIcon renders package-supplied SVG as an isolated image with contain sizing.
The manifest’s optional iconColor defaults to original; theme uses the asset’s
alpha mask filled with semantic foreground color. Both modes preserve transparency
and use the same image-error fallback; never inject package SVG into the DOM. Standard icons are 32px in
lists, catalog choices and installation review; scenario/connection header icons are 48px to match the title and description with their standard 8px gap; compact icons
are 20px in ExtensionLabel beside connection choices and references. Icons are
decorative beside visible names. Missing or broken images use WorkflowIcon for
scenarios and PlugIcon for connections. Both themes use the same asset.
SettingsRow and EditorHeader expose a shared media slot; keep media beside text
on mobile while actions stack. Profiles retain their own identity composition.

## Declarative extension settings (SDK 0.2)

Scenario and connection editors share `EditorPanel` and `ExtensionFields`. A package
block has a required localized name/description, optional controls, and optional
footer text/links. Editable existing blocks save together; new instances have one
Create action after all blocks. Informational/read-only blocks omit Save and empty
body/footer regions. Credentials remain one atomic block and are cleared from the
browser after successful replacement. Other pending drafts remain guarded.

Use shared Field/Input/InputGroup/Textarea/Select/RadioGroup/Switch primitives.
Radio cards and input adornments belong in the shared renderer, not feature pages.
Validation errors appear beside controls with linked accessible descriptions.
Hidden visual labels still provide accessible names. Disabled controls explain why.
Official metadata and host UI strings use `messages(locale)`. Third-party package
metadata may use SDK-owned `{en, ru?}` translations, with English fallback; this is
the explicit exception to the shared-dictionary rule. No HTML or executable UI.

Settings block footers use 12px top/right/bottom padding, retain aligned left padding,
and use size="sm" Save buttons. Disabled buttons use muted fill/text with a subtle
border instead of fading the primary fill. Switches always have visible text
next to the control, including single-field blocks. Do not show Required text beside
field labels; retain aria-required and inline validation errors.


Scenario/connection header fields stack on mobile and share EditorPanel media/action slots.
Creation omits runtime status and retains one Create action after all blocks. Successful
saves refresh status without replacing the schema or other drafts. Paused connections
stop syncing but retain cached data for existing scenario bindings; header copy explains
this. Scenario connection choices show paused entries as disabled, retaining existing
selections. Connection rows remain editable and manual refresh is disabled while paused.

Scenario connections sit immediately below the identity panel, before package settings.
Use the shared ScenarioConnections composition: one EditorPanel, separated input groups,
compact selectable rows with extension icon, name label, avatar-only ProfileLabel and InstanceHealth.
The row surface/name selects; a separate Open action opens settings. Header actions align
with the top of the title. Input groups use EditorPanelSection and the standard CardFooter
for compatibility details and Save, never a replacement action area inside the body.
Connection choice errors appear in the health tooltip, without duplicate inline error text.
Single inputs use radios (including None when optional); multiple inputs use checkboxes.
Selected rows use semantic accent/border styling. Paused choices remain visible and disabled.
Dataset labels disambiguate choices; contract IDs/versions live in expandable details.
Existing input groups save independently; creation retains the single Create action.

Connection Open actions open the shared connection editor in an editor Sheet (640px desktop,
full-width mobile). Add connection opens the shared type picker filtered by the input's
contract and accepted version. Successful creation selects the matching dataset in the
scenario draft; multiple matches require a choice. Connection creation is independent of
scenario saving. Sheets preserve the scenario draft and guard their own unsaved edits on
close/back; only the active editor guards navigation, including the underlying draft.
Save and validation events stay scoped to their editor. Refresh failures after a successful
creation retain the created ID and retry reading it, never creating another instance.

Sheets load the shared Tailwind animation utilities, use a dimmed blurred backdrop, and
remain mounted through the Radix closing animation. Respect prefers-reduced-motion.

Resource tables size health, card count, profile and menu columns to their content,
with consistent cell padding. The name column takes the remaining width; health
and count labels stay on one line. Avoid fixed metadata widths that leave large gaps.

Saved scenario/connection identity panels share the existing three-dot actions menu
beside Enabled, with Delete and the shared confirmation. New drafts omit the menu.
Failed deletion stays in the confirmation with feedback; connections in use cannot be
deleted. Deletion from a sheet preserves the scenario draft and removes stale choices.

## Action feedback

Use the shared Sonner toaster in the root layout for successful explicit actions:
resource creation, saves, deletions, enable/disable, refresh requests, preferences,
clipboard actions and package operations. Toasts survive navigation, appear at the
bottom right for five seconds, and have localized dismiss controls. Appearance uses
semantic theme tokens and Tailwind in the shared primitive. Do not also show inline
Saved/Copied messages. Keep validation/save errors near their controls, failed
confirmations inside the dialog, and loading/runtime errors persistent. Standalone
action failures use error toasts. Background polling and favorite toggles stay quiet.
Only claim completion when the API confirms it; queued refreshes/installations say
requested. A successful mutation followed by a failed read remains a successful
mutation with separate refresh feedback.

Full-page creation returns to /screens, /profiles, /scenarios or /connections with a
resource-specific success toast. Existing records save in place (screen ID renames
update the editor URL). Connections created inside a scenario sheet retain its
selection flow and the scenario draft. Independent panel saves preserve other drafts.

Saved connection identity panels show a Used by section below runtime status, with compact scenario links and shared extension/profile identities sorted by localized name. Show all saved dependents, including paused scenarios, once each; unused connections show localized quiet empty copy and new drafts omit usage. Links open in the same tab through the existing editor navigation guard, including sheets and underlying scenario drafts. Usage reflects loaded saved bindings, not unsaved selections.

Connection usage starts after an inset Separator within the identity card. Each scenario row has a separate Disconnect action. Ordinary disconnects run immediately with success/error toasts; only actions that disable a scenario require confirmation. Disconnect removes only that connection’s saved bindings, preserving other configuration and pending drafts; disconnecting the last source of a required input asks to disable the scenario in the confirmation and performs both changes atomically. Disabled scenarios may have empty required inputs; enabling requires valid bindings. Sheet disconnects reconcile the underlying scenario draft to prevent restoring removed bindings.

Confirmations that disable a scenario include the shared warning callout: warning icon, prominent consequence title, and explanatory text, alongside the explicit Disable and disconnect action. Ordinary disconnects do not open a confirmation.

Disconnect success toasts offer Undo for the standard toast duration. Undo restores the saved bindings and prior enabled state, rejects newer scenario revisions, and reconciles open editors without discarding unrelated drafts. Toast actions reuse shared Button styling.

Connection deletion confirmations embed the shared Used by list and disconnect controls across collection menus, full editors and sheets. Explain dependencies and disable Delete until the list is empty; disconnecting the last scenario never deletes the connection automatically. Bound long dialog lists with a scrolling body while retaining the confirmation actions.

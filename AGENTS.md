# Peek project rules

Before changing UI, read `apps/web/DESIGN.md` and `apps/web/AGENTS.md`.

Design consistency is a project requirement. Implement recurring patterns as shared
components first, then compose pages from them. Do not copy markup and CSS between
pages or introduce a new visual pattern for an existing interaction. Changes to a
shared pattern must reach every consumer, including `/design-system`.

UI appearance belongs in Tailwind utilities next to component code. Use CVA for
variants and cn() for class composition. globals.css is reserved for Tailwind,
semantic theme tokens and genuinely global base rules; never add component/page
selectors or overrides of shadcn internals there. Reuse settings compositions and
existing shadcn primitives, and migrate every consumer when changing a pattern.

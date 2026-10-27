# @peekapp/cli

Tools for authoring Peek extensions. Requires Node.js 24+.

```sh
npm install --save-dev @peekapp/cli
npx peek init scenario my-scenario
cd my-scenario
npm install
npx peek check
npx peek pack
```

Use `peek init connection DIRECTORY` for a connection. The project has
`peek.json` (manifest) and `index.ts` (default SDK definition). `pack` bundles
JavaScript dependencies into a `.peek` archive; it never runs extension code.
Native addons and dependencies requiring runtime-discovered files cannot be
included in this single-JavaScript-bundle format. Use libraries that can be bundled
for Node.js 24. Installation never runs npm lifecycle scripts on the Peek host.

`peek bundle OUTPUT.peek A.peek B.peek` combines separately identified packages
for convenient scenario + connection delivery. Dependencies retain independent
IDs/versions and can be reused by other scenarios.

`peek preview PACKAGE.peek CONTEXT.json` runs through the same Docker isolation
as installed extensions and prints resulting card/dataset JSON. Install/build the
Peek runtime images first; the CLI refuses to execute extension code on the host.
Preview stops after 30 seconds. Rendered cards can be previewed on a local Peek
screen by installing the package and configuring an instance.

For development before npm publication, install the SDK and CLI tarballs created
by `npm pack` in their respective workspace directories.

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

## SDK 0.2 settings

CLI 0.2 scaffolds and validates format 3 manifests with required `settingsUi.blocks`.
Package validation rejects missing/duplicate field references, incompatible controls,
invalid translations and options, unsafe links, and unsupported regex patterns.
Existing format 2 packages must be updated explicitly; there is no generated-layout
fallback. See the [settings guide](https://github.com/peekapp/peek/blob/main/docs/extensions.md#settings-blocks-sdk-02--format-3).

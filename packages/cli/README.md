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

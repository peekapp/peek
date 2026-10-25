#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { manifest } from "@peek/extensions/validation";
import { encode, decode, digest } from "@peek/extensions/archive";
import {
  runContainer,
  readiness,
} from "../../../apps/extension-runner/src/docker";
const [command, ...args] = process.argv.slice(2);
async function main() {
  if (command === "init") {
    const [kind, folder] = args;
    if (!["scenario", "connection"].includes(kind) || !folder)
      throw new Error("Usage: peek init scenario|connection DIRECTORY");
    const dir = resolve(folder);
    await mkdir(dir, { recursive: false });
    const m = {
      format: 2,
      sdk: "^0.1.0",
      id: `local/${kind}-example`,
      version: "0.1.0",
      kind,
      name: `Example ${kind}`,
      description: "A Peek extension",
      author: "Your name",
      entry: "index.mjs",
      settings: {
        type: "object",
        properties: { title: { type: "string", default: "Hello Peek" } },
        additionalProperties: false,
      },
      permissions: {},
      ...(kind === "connection"
        ? {
            provides: {
              items: {
                id: "local/items",
                version: "1.0.0",
                schema: { type: "array", items: { type: "string" } },
              },
            },
          }
        : { inputs: {} }),
    };
    await writeFile(join(dir, "peek.json"), JSON.stringify(m, null, 2) + "\n");
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: m.id.replace("/", "-"),
          private: true,
          type: "module",
          scripts: { check: "peek check", pack: "peek pack" },
          dependencies: { "@peekapp/sdk": "^0.1.2" },
          devDependencies: { "@peekapp/cli": "^0.1.2" },
        },
        null,
        2,
      ) + "\n",
    );
    const source =
      kind === "scenario"
        ? `import { defineScenario } from "@peekapp/sdk/scenario";
export default defineScenario({ evaluate({ settings, now }) {
  return { cards: [{ id: "hello", title: String((settings as any).title ?? "Hello Peek"), targetAt: now + 60000, visibleFrom: now, expiresAt: now + 60000 }], nextRunAt: now + 60000 };
} });
`
        : `import { defineConnection } from "@peekapp/sdk/connection";
export default defineConnection({ run({ now }) { return { datasets: { items: ["Hello Peek"] }, nextRunAt: now + 60000 }; } });
`;
    await writeFile(join(dir, "index.ts"), source);
    console.log(`Created ${dir}`);
    return;
  }
  if (command === "bundle") {
    if (args.length < 3)
      throw new Error(
        "Usage: peek bundle OUTPUT.peek PACKAGE.peek PACKAGE.peek ...",
      );
    const packages = (
      await Promise.all(
        args.slice(1).map(async (p) => decode(await readFile(p)).packages),
      )
    ).flat();
    await writeFile(args[0], encode(packages));
    console.log(args[0]);
    return;
  }
  if (["check", "pack"].includes(command)) {
    const dir = resolve(args[0] ?? ".");
    const m = manifest(
      JSON.parse(await readFile(join(dir, "peek.json"), "utf8")),
    );
    const built = await build({
      entryPoints: [join(dir, "index.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      write: false,
      packages: "bundle",
      banner: {
        js: "import { createRequire as __peekRequire } from 'node:module'; globalThis.require = __peekRequire(import.meta.url);",
      },
    });
    if (built.outputFiles.length !== 1)
      throw new Error("single-javascript-bundle-required");
    const bytes = encode([
      { manifest: m, files: { "index.mjs": built.outputFiles[0].text } },
    ]);
    if (command === "pack") {
      const output = resolve(
        args[1] ?? `${m.id.replace("/", "-")}-${m.version}.peek`,
      );
      await writeFile(output, bytes);
      console.log(`${output}\nsha256: ${digest(bytes)}`);
    } else console.log(`Valid: ${m.id}@${m.version}`);
    return;
  }
  if (command === "preview") {
    if (args.length !== 2)
      throw new Error(
        "Usage: peek preview PACKAGE.peek CONTEXT.json (requires Peek runtime Docker images)",
      );
    const bundle = decode(await readFile(args[0]));
    if (bundle.packages.length !== 1) throw new Error("preview-one-package");
    await readiness();
    const run = await runContainer(
      bundle.packages[0],
      JSON.parse(await readFile(args[1], "utf8")),
      (result) => console.log(JSON.stringify(result, null, 2)),
    );
    const timer = setTimeout(() => void run.stop(), 30000);
    try {
      await run.done;
    } finally {
      clearTimeout(timer);
    }
    return;
  }
  console.log(
    "peek init scenario|connection DIRECTORY\npeek check [DIRECTORY]\npeek pack [DIRECTORY] [OUTPUT.peek]\npeek bundle OUTPUT.peek PACKAGE.peek PACKAGE.peek ...\npeek preview PACKAGE.peek CONTEXT.json",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

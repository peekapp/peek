import { mkdtemp, readFile, rm, writeFile, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve("."),
  dir = await mkdtemp(join(tmpdir(), "peek-npm-"));
async function run(args: string[], cwd: string) {
  const p = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code) throw new Error(`${args.join(" ")}: ${err}`);
  return out;
}
try {
  const tarballs: string[] = [];
  for (const name of ["sdk", "cli"]) {
    const result = JSON.parse(
      await run(
        [
          "npm",
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          dir,
        ],
        join(root, "packages", name),
      ),
    );
    tarballs.push(join(dir, result[0].filename));
  }
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "peek-external-consumer",
      private: true,
      type: "module",
    }),
  );
  await run(["npm", "install", "--ignore-scripts", ...tarballs], dir);
  await run(
    [
      "node",
      "--input-type=module",
      "-e",
      "import {defineScenario} from '@peekapp/sdk/scenario'; import {defineConnection} from '@peekapp/sdk/connection'; import {eventsContract} from '@peekapp/sdk/contracts/events'; if(!defineScenario({evaluate(){}})||!defineConnection({run(){}})||eventsContract.id!=='peek/events') process.exit(1)",
    ],
    dir,
  );
  await run(
    [
      "node",
      join(dir, "node_modules/@peekapp/cli/dist/cli.mjs"),
      "init",
      "scenario",
      "sample",
    ],
    dir,
  );
  // The sample resolves SDK from this external project's node_modules, never the monorepo.
  await run(
    [
      "node",
      join(dir, "node_modules/@peekapp/cli/dist/cli.mjs"),
      "check",
      "sample",
    ],
    dir,
  );
  await run(
    [
      "node",
      join(dir, "node_modules/@peekapp/cli/dist/cli.mjs"),
      "pack",
      "sample",
      join(dir, "sample.peek"),
    ],
    dir,
  );
  if (!(await readFile(join(dir, "sample.peek"))).length)
    throw new Error("empty-package");
  const cli = join(dir, "node_modules/@peekapp/cli/dist/cli.mjs");
  await run(["node", cli, "init", "connection", "connection"], dir);
  const m = JSON.parse(
    await readFile(join(dir, "connection/peek.json"), "utf8"),
  );
  if (m.format !== 2 || m.kind !== "connection")
    throw new Error("incorrect-scaffold");
  await run(["node", cli, "check", "connection"], dir);
  await run(["node", cli, "pack", "connection", "connection.peek"], dir);
  await cp(join(root, "extensions/examples"), join(dir, "examples"), {
    recursive: true,
  });
  for (const name of [
    "connection",
    "scenario",
    "events-connection",
    "events-scenario",
  ])
    await run(
      ["node", cli, "pack", `examples/${name}`, `${name}-example.peek`],
      dir,
    );
  await mkdir(join(dir, "empty-types"));
  await run(
    [
      join(root, "node_modules/.bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--typeRoots",
      join(dir, "empty-types"),
      "sample/index.ts",
      "connection/index.ts",
      "examples/events-connection/index.ts",
    ],
    dir,
  );
  console.log("SDK and CLI work in a clean external npm project.");
} finally {
  await rm(dir, { recursive: true, force: true });
}

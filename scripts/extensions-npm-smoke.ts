import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      "import {defineScenario} from '@peekapp/sdk/scenario'; import {defineIntegration} from '@peekapp/sdk/integration'; if(!defineScenario({evaluate(){}})||!defineIntegration({run(){}})) process.exit(1)",
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
  console.log("SDK and CLI work in a clean external npm project.");
} finally {
  await rm(dir, { recursive: true, force: true });
}

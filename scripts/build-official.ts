import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir("extensions/dist", { recursive: true });
for (const name of ["ical", "meetings", "deadlines"]) {
  const child = Bun.spawn(
    [
      process.execPath,
      "packages/cli/dist/cli.mjs",
      "pack",
      `extensions/official/${name}`,
      `extensions/dist/${name}.peek`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (await child.exited) throw new Error(`Failed to build ${name}`);
}
const bundle = Bun.spawn(
  [
    process.execPath,
    "packages/cli/dist/cli.mjs",
    "bundle",
    "extensions/dist/official.peek",
    ...["ical", "meetings", "deadlines"].map((n) =>
      resolve(`extensions/dist/${n}.peek`),
    ),
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if (await bundle.exited) throw new Error("Failed to bundle official packages");

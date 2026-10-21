import { createInterface } from "node:readline";
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const lines = createInterface({ input: process.stdin });
const line = await new Promise(resolve => lines.once("line", resolve));
lines.close();
const request = JSON.parse(line);
await mkdir("/tmp/extension", { recursive: true });
for (const [path, text] of Object.entries(request.files)) {
  if (!/^(index\.mjs|assets\/[a-zA-Z0-9_-]+\.(json|txt))$/.test(path)) throw new Error("invalid-file");
  if (path.startsWith("assets/")) await mkdir("/tmp/extension/assets", { recursive: true });
  await writeFile(`/tmp/extension/${path}`, text);
}
const send = value => new Promise((resolve, reject) => {
  const line = JSON.stringify(value) + "\n";
  if (Buffer.byteLength(line) > 8 * 1024 * 1024) return reject(new Error("message-too-large"));
  process.stdout.write(line, error => error ? reject(error) : resolve());
});
// Plugin logs never become protocol messages or host logs containing credentials.
console.log = console.info = console.warn = console.error = () => {};
const definition = (await import(pathToFileURL("/tmp/extension/index.mjs").href)).default;
const controller = new AbortController();
process.once("SIGTERM", () => controller.abort());
try {
  if (request.action === "migrate") {
    const result = definition.migrate ? await definition.migrate(request.context) : { settings: request.context.settings, state: request.context.state };
    await send({ type: "migration", result });
  } else if (request.kind === "scenario") {
    await send({ type: "result", result: await definition.evaluate(request.context) });
  } else {
    const result = await definition.run({ ...request.context, signal: controller.signal, publish: result => send({ type: "result", result }) });
    if (result !== undefined) await send({ type: "result", result });
  }
} catch { process.exitCode = 1; }

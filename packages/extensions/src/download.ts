import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { LIMITS } from "./validation";
import { decode, digest, type ExtensionPackage } from "./archive";
import { compatible } from "./validation";
export async function downloadPackage(
  urlText: string,
  redirects = 0,
): Promise<Buffer> {
  const url = new URL(urlText);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    redirects > 4
  )
    throw new Error("invalid-download-url");
  const addresses = await Promise.race([
    lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true }),
    new Promise<never>((_, reject) =>
      AbortSignal.timeout(15000).addEventListener(
        "abort",
        () => reject(new Error("download-timeout")),
        { once: true },
      ),
    ),
  ]);
  if (
    !addresses.length ||
    addresses.some((a) => ipaddr.process(a.address).range() !== "unicast")
  )
    throw new Error("blocked-download-address");
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        agent: false,
        signal: AbortSignal.timeout(15000),
        headers: { "Accept-Encoding": "identity" },
        lookup: (_host, options, callback) => {
          if (typeof options === "object" && options.all)
            callback(null, [selected] as never);
          else callback(null, selected.address, selected.family);
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          downloadPackage(
            new URL(res.headers.location, url).href,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (
          res.statusCode !== 200 ||
          (res.headers["content-encoding"] &&
            res.headers["content-encoding"] !== "identity")
        ) {
          res.destroy();
          reject(new Error("download-failed"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > LIMITS.archive) {
            res.destroy();
            reject(new Error("archive-too-large"));
          } else chunks.push(chunk);
        });
        res.once("error", reject);
        res.once("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.once("error", reject);
    req.end();
  });
}
export async function dependencies(
  initial: ExtensionPackage[],
  installed: ExtensionPackage[],
) {
  const pending = new Map(initial.map((p) => [p.manifest.id, p]));
  const known = new Map(installed.map((p) => [p.manifest.id, p]));
  let total = 0;
  for (const p of pending.values()) {
    for (const d of p.manifest.dependencies ?? []) {
      const existing = pending.get(d.id) ?? known.get(d.id);
      if (existing && compatible(existing.manifest.version, d.version))
        continue;
      if (existing && pending.has(d.id)) throw new Error("dependency-conflict");
      if (!d.url || !d.sha256) throw new Error(`missing-dependency: ${d.id}`);
      if (pending.size >= 32) throw new Error("too-many-dependencies");
      const bytes = await downloadPackage(d.url);
      total += bytes.length;
      if (total > LIMITS.unpacked) throw new Error("dependencies-too-large");
      if (digest(bytes) !== d.sha256) throw new Error("integrity-mismatch");
      const bundle = decode(bytes);
      if (
        bundle.packages.length !== 1 ||
        bundle.packages[0].manifest.id !== d.id ||
        !compatible(bundle.packages[0].manifest.version, d.version)
      )
        throw new Error("invalid-dependency-package");
      pending.set(d.id, bundle.packages[0]);
    }
  }
  return [...pending.values()];
}

import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { Manifest } from "@peekapp/sdk";
import { manifest, LIMITS } from "./validation";
export type ExtensionPackage = {
  manifest: Manifest;
  files: Record<string, string>;
};
export type Bundle = { format: "peek-bundle-1"; packages: ExtensionPackage[] };
export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function packageDigest(p: ExtensionPackage) {
  return digest(Buffer.from(JSON.stringify(p)));
}
export function decode(bytes: Uint8Array): Bundle {
  if (bytes.byteLength > LIMITS.archive) throw new Error("archive-too-large");
  const raw = gunzipSync(bytes, { maxOutputLength: LIMITS.unpacked });
  const bundle = JSON.parse(raw.toString("utf8")) as Bundle;
  if (
    bundle.format !== "peek-bundle-1" ||
    !Array.isArray(bundle.packages) ||
    !bundle.packages.length ||
    bundle.packages.length > 32
  )
    throw new Error("invalid-bundle");
  const ids = new Set<string>();
  for (const p of bundle.packages) {
    p.manifest = manifest(p.manifest);
    if (ids.has(p.manifest.id)) throw new Error("duplicate-package");
    ids.add(p.manifest.id);
    if (
      !p.files ||
      typeof p.files !== "object" ||
      Array.isArray(p.files) ||
      typeof p.files["index.mjs"] !== "string" ||
      Object.keys(p.files).length > 100
    )
      throw new Error("invalid-files");
    for (const [path, contents] of Object.entries(p.files)) {
      // The format contains only UTF-8 files, never links, modes or archive paths.
      if (
        !/^(index\.mjs|assets\/[a-zA-Z0-9_-]+\.(json|txt))$/.test(path) ||
        typeof contents !== "string"
      )
        throw new Error("unsafe-package-file");
    }
  }
  return bundle;
}
export function encode(packages: ExtensionPackage[]) {
  const bytes = gzipSync(JSON.stringify({ format: "peek-bundle-1", packages }));
  decode(bytes);
  return bytes;
}
export function resolvePackages(
  installed: ExtensionPackage[],
  incoming: ExtensionPackage[],
) {
  const selected = new Map(installed.map((p) => [p.manifest.id, p]));
  for (const p of incoming) selected.set(p.manifest.id, p);
  return selected;
}

import { eventsContract } from "@peekapp/sdk/contracts/events";
import Ajv, { type ValidateFunction } from "ajv";
import semver from "semver";
import { isIP } from "node:net";
import { type Manifest, type Schema, type Contract } from "@peekapp/sdk";
const validators = new Map<string, ValidateFunction>();
export const PACKAGE_ID = /^[a-z][a-z0-9-]{0,39}\/[a-z][a-z0-9-]{0,59}$/;
export const LIMITS = {
  icon: 32 * 1024,
  archive: 16 * 1024 * 1024,
  unpacked: 32 * 1024 * 1024,
  message: 8 * 1024 * 1024,
  state: 1024 * 1024,
  cards: 1000,
};
const keywords = new Set([
  "oneOf",
  "format",
  "type",
  "title",
  "description",
  "properties",
  "required",
  "items",
  "enum",
  "default",
  "additionalProperties",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
]);
function validator(schema: Schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    throw new Error("invalid-schema");
  const text = JSON.stringify(schema);
  if (text.length > 64000) throw new Error("schema-too-large");
  const cached = validators.get(text);
  if (cached) return cached;
  function visit(s: unknown, depth = 0) {
    if (depth > 12 || !s || typeof s !== "object" || Array.isArray(s))
      throw new Error("invalid-schema");
    for (const [k, v] of Object.entries(s)) {
      if (!keywords.has(k)) throw new Error("unsupported-schema-keyword");
      if (k === "format" && !["date", "time-zone"].includes(v as string))
        throw new Error("unsupported-schema-format");
      if (k === "oneOf") {
        if (!Array.isArray(v) || !v.length || v.length > 8)
          throw new Error("invalid-schema");
        for (const child of v) visit(child, depth + 1);
      }
      if (k === "properties") {
        if (
          !v ||
          typeof v !== "object" ||
          Array.isArray(v) ||
          Object.keys(v).length > 100
        )
          throw new Error("invalid-schema");
        for (const [name, child] of Object.entries(v)) {
          if (["__proto__", "constructor", "prototype"].includes(name))
            throw new Error("invalid-property");
          visit(child, depth + 1);
        }
      }
      if (
        k === "items" ||
        (k === "additionalProperties" && typeof v !== "boolean")
      )
        visit(v, depth + 1);
    }
  }
  visit(schema);
  const fn = new Ajv({
    strict: false,
    allErrors: false,
    validateFormats: true,
  })
    .addFormat("date", (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const ms = Date.parse(value);
      return (
        Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
      );
    })
    .addFormat("time-zone", (value: string) => {
      if (value.length > 100 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value))
        return false;
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    })
    .compile(schema);
  if (validators.size >= 128)
    validators.delete(validators.keys().next().value!);
  validators.set(text, fn);
  return fn;
}
export function assertSchema(schema: Schema) {
  validator(schema);
}
export function validate(schema: Schema, value: unknown) {
  if (!validator(schema)(value)) throw new Error("schema-validation-failed");
}
export function manifest(input: unknown): Manifest {
  const m = input as Manifest;
  if (
    !m ||
    m.format !== 2 ||
    m.sdk !== "^0.1.0" ||
    !PACKAGE_ID.test(m.id) ||
    !semver.valid(m.version) ||
    !["scenario", "connection"].includes(m.kind) ||
    m.entry !== "index.mjs"
  )
    throw new Error("invalid-manifest");
  if (m.icon !== undefined && m.icon !== "assets/icon.svg")
    throw new Error("invalid-icon-path");
  if (m.iconColor !== undefined && !["original", "theme"].includes(m.iconColor))
    throw new Error("invalid-icon-color");
  for (const field of [m.name, m.description, m.author])
    if (typeof field !== "string" || !field.trim() || field.length > 2000)
      throw new Error("invalid-metadata");
  if (
    !m.permissions ||
    typeof m.permissions !== "object" ||
    Object.keys(m.permissions).some((k) => !["internet", "local"].includes(k))
  )
    throw new Error("invalid-permissions");
  if (
    m.permissions.internet !== undefined &&
    typeof m.permissions.internet !== "boolean"
  )
    throw new Error("invalid-permissions");
  if (m.kind === "scenario" && Object.keys(m.permissions).length)
    throw new Error("scenario-permissions-forbidden");
  if (
    m.permissions.local &&
    (!Array.isArray(m.permissions.local) ||
      m.permissions.local.length > 16 ||
      m.permissions.local.some(
        (x) =>
          isIP(x.address) !== 4 ||
          !Number.isInteger(x.port) ||
          x.port < 1 ||
          x.port > 65535,
      ))
  )
    throw new Error("invalid-local-permissions");
  assertSchema(m.settings);
  if (m.settings.type !== "object") throw new Error("settings-must-be-object");
  if (m.secrets) {
    if (m.kind !== "connection") throw new Error("scenario-secrets-forbidden");
    assertSchema(m.secrets);
  }
  for (const entries of [m.provides, m.inputs])
    if (
      entries !== undefined &&
      (!entries ||
        typeof entries !== "object" ||
        Array.isArray(entries) ||
        Object.keys(entries).length > 64)
    )
      throw new Error("invalid-contracts");
  for (const [name, c] of Object.entries(m.provides ?? {})) {
    if (
      !c ||
      m.kind !== "connection" ||
      !/^[a-z][a-zA-Z0-9-]{0,63}$/.test(name) ||
      !PACKAGE_ID.test(c.id) ||
      !semver.valid(c.version)
    )
      throw new Error("invalid-contract");
    assertSchema(c.schema);
  }
  if (
    m.contracts !== undefined &&
    (!Array.isArray(m.contracts) || m.contracts.length > 64)
  )
    throw new Error("invalid-contracts");
  const definitions = new Map<string, string>();
  for (const c of contractDefinitions(m)) {
    if (!c || !PACKAGE_ID.test(c.id) || !semver.valid(c.version))
      throw new Error("invalid-contract");
    assertSchema(c.schema);
    const key = `${c.id}@${c.version}`,
      schema = canonicalSchema(c.schema);
    if (
      (definitions.has(key) && definitions.get(key) !== schema) ||
      (c.id === eventsContract.id &&
        c.version === eventsContract.version &&
        schema !== canonicalSchema(eventsContract.schema))
    )
      throw new Error(`contract-definition-conflict: ${key}`);
    definitions.set(key, schema);
  }
  for (const [name, i] of Object.entries(m.inputs ?? {})) {
    if (
      !i ||
      m.kind !== "scenario" ||
      !/^[a-z][a-zA-Z0-9-]{0,63}$/.test(name) ||
      !PACKAGE_ID.test(i.contract) ||
      !semver.validRange(i.version)
    )
      throw new Error("invalid-input");
    if (
      !(m.contracts ?? []).some(
        (c) => c.id === i.contract && semver.satisfies(c.version, i.version),
      )
    )
      throw new Error(`missing-input-contract-definition: ${name}`);
  }
  if (
    m.dependencies &&
    (!Array.isArray(m.dependencies) || m.dependencies.length > 32)
  )
    throw new Error("invalid-dependencies");
  const ids = new Set<string>();
  for (const d of m.dependencies ?? []) {
    if (
      !PACKAGE_ID.test(d.id) ||
      d.id === m.id ||
      ids.has(d.id) ||
      !semver.validRange(d.version)
    )
      throw new Error("invalid-dependency");
    ids.add(d.id);
    if (
      d.url &&
      (!d.url.startsWith("https://") || !/^[a-f0-9]{64}$/.test(d.sha256 ?? ""))
    )
      throw new Error("dependency-needs-integrity");
  }
  return m;
}
export { compatible } from "./compatibility";
export function boundedJson(value: unknown, bytes: number) {
  const text = JSON.stringify(value);
  if (text === undefined || Buffer.byteLength(text) > bytes)
    throw new Error("payload-too-large");
  return text;
}

/** Object key order is irrelevant; array order and all schema annotations are canonical. */
export function canonicalSchema(value: unknown): string {
  function ordered(v: any): any {
    if (Array.isArray(v)) return v.map(ordered);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, ordered(v[k])]),
      );
    return v;
  }
  return JSON.stringify(ordered(value));
}
export function contractDefinitions(m: Manifest): Contract[] {
  return [...Object.values(m.provides ?? {}), ...(m.contracts ?? [])];
}

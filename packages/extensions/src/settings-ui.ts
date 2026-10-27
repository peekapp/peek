import type { Manifest } from "@peekapp/sdk";
import { settingIssue } from "@peekapp/sdk";
import { messages } from "@peek/core/i18n";

function object(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid-settings-ui");
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("invalid-settings-ui");
}
function text(value: unknown) {
  object(value);
  if ("key" in value) {
    keys(value, ["key"]);
    if (
      typeof value.key !== "string" ||
      !Object.hasOwn(messages("en"), value.key)
    )
      throw new Error("invalid-settings-text-key");
  } else {
    keys(value, ["en", "ru"]);
    for (const locale of ["en", ...(value.ru !== undefined ? ["ru"] : [])])
      if (
        typeof value[locale] !== "string" ||
        !value[locale].trim() ||
        value[locale].length > 2000
      )
        throw new Error("invalid-settings-text");
  }
}
function content(value: unknown) {
  object(value);
  keys(value, ["text", "links", "type"]);
  if (value.text !== undefined) text(value.text);
  if (value.links !== undefined) {
    if (!Array.isArray(value.links) || value.links.length > 8)
      throw new Error("invalid-settings-links");
    for (const link of value.links) {
      object(link);
      keys(link, ["label", "href"]);
      text(link.label);
      if (typeof link.href !== "string" || link.href.length > 2000)
        throw new Error("invalid-settings-link");
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        throw new Error("invalid-settings-link");
      }
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("invalid-settings-link");
    }
  }
}
export function assertSettingsUi(m: Manifest) {
  object(m.settingsUi);
  keys(m.settingsUi, ["blocks"]);
  if (
    !Array.isArray(m.settingsUi.blocks) ||
    m.settingsUi.blocks.length > 100 ||
    JSON.stringify(m.settingsUi).length > 64000
  )
    throw new Error("invalid-settings-ui");
  const ids = new Set<string>(),
    seen = new Set<string>();
  let credentialBlocks = 0;
  for (const block of m.settingsUi.blocks) {
    object(block);
    keys(block, ["id", "name", "description", "source", "controls", "footer"]);
    if (
      typeof block.id !== "string" ||
      !/^[a-z][a-zA-Z0-9-]{0,63}$/.test(block.id) ||
      ids.has(block.id)
    )
      throw new Error("invalid-settings-block-id");
    ids.add(block.id);
    text(block.name);
    text(block.description);
    if (
      block.source !== undefined &&
      !["settings", "secrets"].includes(block.source)
    )
      throw new Error("invalid-settings-source");
    if (block.source === "secrets" && (++credentialBlocks > 1 || !m.secrets))
      throw new Error("invalid-credentials-block");
    if (block.footer !== undefined) content(block.footer);
    const controls = block.controls ?? [];
    if (!Array.isArray(controls) || controls.length > 100)
      throw new Error("invalid-settings-controls");
    const fields = controls.filter((c) => c?.type !== "text");
    for (const c of controls) {
      object(c);
      if (c.type === "text") {
        content(c);
        continue;
      }
      keys(c, [
        "type",
        "field",
        "label",
        "hideLabel",
        "placeholder",
        "hint",
        "disabled",
        "disabledReason",
        "prefix",
        "suffix",
        "options",
        "copy",
      ]);
      const source = block.source ?? "settings";
      const schema = source === "secrets" ? m.secrets : m.settings;
      if (
        typeof c.field !== "string" ||
        !Object.hasOwn(schema?.properties ?? {}, c.field)
      )
        throw new Error("unknown-settings-field");
      const s = schema!.properties![c.field];
      const ref = `${source}/${c.field}`;
      if (seen.has(ref)) throw new Error("duplicate-settings-field");
      seen.add(ref);
      if (fields.length > 1 && !c.label)
        throw new Error("settings-label-required");
      for (const key of [
        "label",
        "placeholder",
        "hint",
        "disabledReason",
        "prefix",
        "suffix",
      ] as const)
        if (c[key] !== undefined) text(c[key]);
      for (const key of ["hideLabel", "disabled", "copy"] as const)
        if (c[key] !== undefined && typeof c[key] !== "boolean")
          throw new Error("invalid-settings-control");
      if (
        !["string", "number", "integer", "boolean"].includes(s.type ?? "") ||
        s.oneOf
      )
        throw new Error("unsupported-settings-field");
      if (source === "secrets" ? c.type !== "secret" : c.type === "secret")
        throw new Error("invalid-secret-control");
      const compatible = {
        input: ["string", "number", "integer"],
        textarea: ["string"],
        secret: ["string"],
        select: ["string", "number", "integer", "boolean"],
        radio: ["string", "number", "integer", "boolean"],
        switch: ["boolean"],
        readonly: ["string", "number", "integer", "boolean"],
      };
      if (!compatible[c.type as keyof typeof compatible]?.includes(s.type!))
        throw new Error("incompatible-settings-control");
      if ((c.prefix || c.suffix) && c.type !== "input")
        throw new Error("invalid-settings-adornment");
      if (c.copy !== undefined && c.type !== "readonly")
        throw new Error("invalid-settings-copy");
      if (c.disabledReason && !c.disabled)
        throw new Error("invalid-settings-disabled-reason");
      if (c.type === "select" || c.type === "radio") {
        if (
          !Array.isArray(c.options) ||
          !c.options.length ||
          c.options.length > 100 ||
          !s.enum
        )
          throw new Error("invalid-settings-options");
        const choices = new Set<string>();
        for (const option of c.options) {
          object(option);
          keys(option, ["value", "label", "description"]);
          text(option.label);
          if (option.description !== undefined) text(option.description);
          if (
            settingIssue(s, option.value) ||
            choices.has(JSON.stringify(option.value))
          )
            throw new Error("invalid-settings-option-value");
          choices.add(JSON.stringify(option.value));
        }
        if (s.enum.some((v) => !choices.has(JSON.stringify(v))))
          throw new Error("missing-settings-option");
      } else if (c.options !== undefined)
        throw new Error("invalid-settings-options");
      if (s.default !== undefined && settingIssue(s, s.default))
        throw new Error("invalid-settings-default");
      if (
        (c.disabled || c.type === "readonly") &&
        schema!.required?.includes(c.field) &&
        s.default === undefined
      )
        throw new Error("required-settings-default-missing");
    }
  }
  for (const source of ["settings", "secrets"] as const) {
    const schema = m[source];
    if (!schema) continue;
    if (
      schema.type !== "object" ||
      schema.oneOf ||
      (schema.required ?? []).some(
        (key) => !Object.hasOwn(schema.properties ?? {}, key),
      )
    )
      throw new Error("invalid-settings-schema");
    for (const field of Object.keys(schema.properties ?? {}))
      if (!seen.has(`${source}/${field}`))
        throw new Error("missing-settings-field");
  }
}

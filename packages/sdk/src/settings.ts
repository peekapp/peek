import type { Json, Schema } from "./index.js";

export type SettingsText = { key: string } | { en: string; ru?: string };
export type SettingsContent = {
  text?: SettingsText;
  links?: { label: SettingsText; href: string }[];
};
export type SettingsOption = {
  value: string | number | boolean;
  label: SettingsText;
  description?: SettingsText;
};
export type SettingsControl =
  | ({ type: "text" } & SettingsContent)
  | {
      type:
        | "input"
        | "textarea"
        | "secret"
        | "select"
        | "radio"
        | "switch"
        | "readonly";
      field: string;
      label?: SettingsText;
      hideLabel?: boolean;
      placeholder?: SettingsText;
      hint?: SettingsText;
      disabled?: boolean;
      disabledReason?: SettingsText;
      prefix?: SettingsText;
      suffix?: SettingsText;
      options?: SettingsOption[];
      copy?: boolean;
    };
export type SettingsBlock = {
  id: string;
  name: SettingsText;
  description: SettingsText;
  source?: "settings" | "secrets";
  controls?: SettingsControl[];
  footer?: SettingsContent;
};
export type SettingsUi = { blocks: SettingsBlock[] };
export type SettingsIssue = { path: string; code: string };

export function settingsText(
  text: SettingsText,
  locale: "en" | "ru",
  dictionary: Record<string, string>,
): string {
  return "key" in text
    ? (dictionary[text.key] ?? text.key)
    : locale === "ru"
      ? (text.ru ?? text.en)
      : text.en;
}

/** Anchored, flat patterns with at most one variable repetition have bounded linear backtracking. */
export function assertSettingsPattern(
  pattern: unknown,
): asserts pattern is string {
  if (
    typeof pattern !== "string" ||
    pattern.length > 256 ||
    !pattern.startsWith("^") ||
    !pattern.endsWith("$")
  )
    throw new Error("unsupported-schema-pattern");
  const body = pattern.slice(1, -1);
  let offset = 0,
    variable = 0,
    size = 0;
  const atom =
    /(?:\\[dDsSwW.\\^$*+?{}()[\]|/-]|\[(?:\\[dDsSwW\\\]\-]|[^\]\\])*\]|[^\\[\]().^$*+?{}|])/y;
  const repeat = /(?:[?*+]|\{\d+(?:,\d*)?\})/y;
  while (offset < body.length) {
    atom.lastIndex = offset;
    const match = atom.exec(body);
    if (!match) throw new Error("unsupported-schema-pattern");
    offset = atom.lastIndex;
    repeat.lastIndex = offset;
    const quantifier = repeat.exec(body)?.[0];
    if (quantifier) {
      offset = repeat.lastIndex;
      if (["?", "*", "+"].includes(quantifier) || quantifier.includes(","))
        variable++;
      const numbers = quantifier.match(/\d+/g)?.map(Number) ?? [1];
      size += Math.max(...numbers);
    } else size++;
    if (variable > 1 || size > 4096)
      throw new Error("unsupported-schema-pattern");
  }
  try {
    new RegExp(pattern, "u");
  } catch {
    throw new Error("invalid-schema-pattern");
  }
}

/** Scalar settings checks shared by the editor and manifest authoring validation. */
export function settingIssue(
  schema: Schema,
  value: Json | undefined,
  required = false,
): string | undefined {
  if (value === undefined) return required ? "required" : undefined;
  if (schema.enum && !schema.enum.some((v) => v === value)) return "enum";
  if (
    schema.type === "integer"
      ? !Number.isInteger(value)
      : typeof value !== schema.type
  )
    return "type";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "type";
    if (typeof schema.minimum === "number" && value < schema.minimum)
      return "minimum";
    if (typeof schema.maximum === "number" && value > schema.maximum)
      return "maximum";
    if (
      typeof schema.exclusiveMinimum === "number" &&
      value <= schema.exclusiveMinimum
    )
      return "exclusiveMinimum";
    if (
      typeof schema.exclusiveMaximum === "number" &&
      value >= schema.exclusiveMaximum
    )
      return "exclusiveMaximum";
  }
  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength)
      return "minLength";
    if (typeof schema.maxLength === "number" && length > schema.maxLength)
      return "maxLength";
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern, "u").test(value)
    )
      return "pattern";
    if (schema.format === "date") {
      const time = Date.parse(value);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(time) ||
        new Date(time).toISOString().slice(0, 10) !== value
      )
        return "format";
    }
    if (schema.format === "time-zone") {
      if (value.length > 100 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value))
        return "format";
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
      } catch {
        return "format";
      }
    }
  }
}

export function settingsPath(source: string, field: string) {
  return `${source}/${field.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

export function settingsIssues(
  schema: Schema,
  values: Record<string, Json>,
  source = "settings",
  fields = Object.keys(schema.properties ?? {}),
): SettingsIssue[] {
  return fields.flatMap((field) => {
    const code = settingIssue(
      schema.properties![field],
      values[field],
      schema.required?.includes(field),
    );
    return code ? [{ path: settingsPath(source, field), code }] : [];
  });
}

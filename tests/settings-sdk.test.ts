import { expect, test } from "bun:test";
import {
  assertSettingsPattern,
  settingIssue,
  settingsIssues,
  settingsText,
  type Manifest,
} from "@peekapp/sdk";
import { messages } from "../packages/core/src/i18n";
import {
  manifest,
  validate,
  assertSchema,
  SchemaValidationError,
} from "../packages/extensions/src/validation";
import fixture from "./fixtures/settings-manifest.json";
const sample = () => structuredClone(fixture) as Manifest;

test("all settings controls validate, including informational and credential blocks", () => {
  expect(manifest(sample()).format).toBe(3);
  expect(() => manifest({ ...sample(), format: 2 })).toThrow(
    "invalid-manifest",
  );
  expect(() => manifest({ ...sample(), settingsUi: undefined })).toThrow(
    "invalid-settings-ui",
  );
});

test("layout rejects missing, repeated, incompatible, and unsafe metadata", () => {
  const changes: ((m: Manifest) => void)[] = [
    (m) => {
      m.settingsUi.blocks.push(m.settingsUi.blocks[0]);
    },
    (m) => {
      m.settingsUi.blocks[0].controls!.pop();
      m.settingsUi.blocks[0].controls!.pop();
    },
    (m) => {
      m.settingsUi.blocks[0].controls!.push(
        m.settingsUi.blocks[0].controls![0],
      );
    },
    (m) => {
      (m.settingsUi.blocks[0].controls![0] as any).field = "missing";
    },
    (m) => {
      (m.settingsUi.blocks[0].controls![0] as any).type = "switch";
    },
    (m) => {
      (m.settingsUi.blocks[0].controls![0] as any).label = undefined;
    },
    (m) => {
      (m.settingsUi.blocks[2].controls![0] as any).options[0].value = "1";
    },
    (m) => {
      (m.settingsUi.blocks[2].controls![0] as any).options.pop();
    },
    (m) => {
      (m.settingsUi.blocks[5].controls![0] as any).type = "readonly";
    },
    (m) => {
      m.settingsUi.blocks[5].source = "settings";
    },
    (m) => {
      m.settingsUi.blocks[0].footer!.links![0].href = "javascript:alert(1)";
    },
    (m) => {
      m.settingsUi.blocks[0].name = { key: "unknown" };
    },
    (m) => {
      m.settingsUi.blocks[0].name = { en: "" };
    },
    (m) => {
      delete m.settings.properties!.identifier.default;
    },
    (m) => {
      m.settings.properties!.count.default = 0;
    },
  ];
  for (const change of changes) {
    const m = sample();
    change(m);
    expect(() => manifest(m)).toThrow();
  }
});

test("patterns use a bounded subset and browser/server validation agree", () => {
  for (const pattern of [
    "^[a-z-]+$",
    "^https://[^ ]+$",
    "^\\d{4}-\\d{2}-\\d{2}$",
    "^hello$",
    "^a{1,20}$",
  ])
    expect(() => assertSettingsPattern(pattern)).not.toThrow();
  for (const pattern of [
    "(a+)+",
    "^(a+)+$",
    "^a*a*$",
    "^(a|aa)+$",
    "^.*.*$",
    "^a{99999999}$",
    "^\\1$",
    "^[z-a]+$",
  ])
    expect(() => assertSettingsPattern(pattern)).toThrow();
  expect(() => assertSchema({ type: "string", pattern: "^a+$" })).toThrow(
    "pattern-needs-max-length",
  );
  const schema = { type: "string", pattern: "^[a-z-]+$", maxLength: 40 };
  for (const value of [
    "calendar",
    "",
    "UPPER",
    "one-two",
    "with space",
    "x".repeat(41),
    "word\n",
  ]) {
    const issue = settingIssue(schema, value);
    if (issue) expect(() => validate(schema, value)).toThrow();
    else expect(() => validate(schema, value)).not.toThrow();
  }
});

test("typed values, optional absence, bounds, Unicode lengths, and safe error paths", () => {
  expect(settingIssue({ type: "integer", minimum: 1 }, 1.5)).toBe("type");
  expect(settingIssue({ type: "number" }, Infinity)).toBe("type");
  expect(settingIssue({ type: "integer" }, undefined)).toBeUndefined();
  expect(settingIssue({ type: "integer" }, undefined, true)).toBe("required");
  expect(settingIssue({ type: "string", maxLength: 1 }, "😀")).toBeUndefined();
  expect(settingIssue({ type: "number", exclusiveMinimum: 1 }, 1)).toBe(
    "exclusiveMinimum",
  );
  const schema = {
    type: "object",
    properties: { "a/b": { type: "integer" } },
    required: ["a/b"],
  };
  expect(settingsIssues(schema, {})).toEqual([
    { path: "settings/a~1b", code: "required" },
  ]);
  try {
    validate(schema, {}, "settings");
    throw new Error("expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect((error as SchemaValidationError).issues).toEqual(
      settingsIssues(schema, {}),
    );
  }
});

test("SDK text uses shared messages and package fallback", () => {
  expect(settingsText({ key: "credentials" }, "ru", messages("ru"))).toBe(
    messages("ru").credentials,
  );
  expect(
    settingsText({ en: "English", ru: "Русский" }, "ru", messages("ru")),
  ).toBe("Русский");
  expect(settingsText({ en: "English" }, "ru", messages("ru"))).toBe("English");
});

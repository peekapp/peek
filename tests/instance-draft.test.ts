import { expect, test } from "bun:test";
import {
  applyInstanceSetting,
  type InstanceDraft,
} from "../apps/web/components/settings/instance-draft";

const saved: InstanceDraft = {
  name: "Meetings",
  profile: "shared",
  enabled: true,
  settings: { lead: 10, filter: "work" },
  bindings: { events: [{ connectionId: "calendar", dataset: "events" }] },
  secrets: {},
  changeSecrets: false,
};
const draft: InstanceDraft = {
  ...saved,
  name: "Work meetings",
  enabled: false,
  settings: { lead: 20 },
  bindings: { events: [] },
  secrets: { token: "replacement" },
  changeSecrets: true,
};

const singleBlocks: import("@peekapp/sdk").SettingsBlock[] = [
  ...["lead", "filter"].map((field) => ({
    id: field,
    name: { en: field },
    description: { en: field },
    controls: [{ type: "input" as const, field }],
  })),
  {
    id: "credentials",
    source: "secrets",
    name: { en: "Credentials" },
    description: { en: "Access token" },
    controls: [{ type: "secret", field: "token" }],
  },
];

test("general settings save together and leave other pending changes out of the payload", () => {
  const general = { ...draft, profile: "other" };
  expect(applyInstanceSetting(saved, general, "general")).toEqual({
    ...saved, name: general.name, profile: general.profile, enabled: general.enabled,
  });
  const first = applyInstanceSetting(saved, general, "block:lead", singleBlocks);
  expect(first).toEqual({ ...saved, settings: { lead: 20, filter: "work" } });
  expect(applyInstanceSetting(first, general, "general")).toEqual({
    ...first, name: general.name, profile: general.profile, enabled: general.enabled,
  });
  expect(applyInstanceSetting(saved, general, "create")).toBe(general);
});
test("cleared optional settings are removed without altering their siblings", () => {
  expect(
    applyInstanceSetting(saved, draft, "block:filter", singleBlocks).settings,
  ).toEqual({ lead: 10 });
  expect(saved.settings).toEqual({ lead: 10, filter: "work" });
});
test("bindings and credentials only change when their own card is saved", () => {
  expect(applyInstanceSetting(saved, draft, "bindings:events")).toEqual({
    ...saved,
    bindings: { events: [] },
  });
  expect(
    applyInstanceSetting(saved, draft, "block:credentials", singleBlocks),
  ).toEqual({ ...saved, secrets: draft.secrets, changeSecrets: true });
});

test("block save is atomic and preserves unrelated drafts and read-only values", () => {
  const blocks: import("@peekapp/sdk").SettingsBlock[] = [
    {
      id: "timing",
      name: { en: "Timing" },
      description: { en: "Timing settings" },
      controls: [
        { type: "input", field: "lead" },
        { type: "input", field: "filter" },
        { type: "readonly", field: "identity" },
      ],
    },
  ];
  const baseline = {
    ...saved,
    settings: { ...saved.settings, identity: "original", unrelated: 1 },
  };
  const pending = {
    ...draft,
    settings: { lead: 30, identity: "changed", unrelated: 2 },
  };
  expect(
    applyInstanceSetting(baseline, pending, "block:timing", blocks),
  ).toEqual({
    ...baseline,
    settings: { lead: 30, identity: "original", unrelated: 1 },
  });
  expect(applyInstanceSetting(baseline, pending, "create", blocks)).toBe(
    pending,
  );
  expect(() =>
    applyInstanceSetting(baseline, pending, "block:missing", blocks),
  ).toThrow();
  expect(pending.settings.unrelated).toBe(2);
});

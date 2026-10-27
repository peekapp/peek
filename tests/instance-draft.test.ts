import { expect, test } from "bun:test";
import { applyInstanceSetting, type InstanceDraft } from "../apps/web/components/settings/instance-draft";

const saved: InstanceDraft = {
  name: "Meetings", profile: "shared", enabled: true,
  settings: { lead: 10, filter: "work" }, bindings: { events: [{ connectionId: "calendar", dataset: "events" }] },
  secrets: {}, changeSecrets: false,
};
const draft: InstanceDraft = {
  ...saved, name: "Work meetings", enabled: false,
  settings: { lead: 20 }, bindings: { events: [] },
  secrets: { token: "replacement" }, changeSecrets: true,
};

test("saving a card leaves other pending changes out of the payload", () => {
  expect(applyInstanceSetting(saved, draft, "name")).toEqual({ ...saved, name: draft.name });
  const first = applyInstanceSetting(saved, draft, "settings:lead");
  expect(first).toEqual({ ...saved, settings: { lead: 20, filter: "work" } });
  expect(applyInstanceSetting(first, draft, "name")).toEqual({ ...first, name: draft.name });
  expect(applyInstanceSetting(saved, draft, "enabled")).toEqual({ ...saved, enabled: false });
});
test("cleared optional settings are removed without altering their siblings", () => {
  expect(applyInstanceSetting(saved, draft, "settings:filter").settings).toEqual({ lead: 10 });
  expect(saved.settings).toEqual({ lead: 10, filter: "work" });
});
test("bindings and credentials only change when their own card is saved", () => {
  expect(applyInstanceSetting(saved, draft, "bindings:events")).toEqual({ ...saved, bindings: { events: [] } });
  expect(applyInstanceSetting(saved, draft, "secrets")).toEqual({ ...saved, secrets: draft.secrets, changeSecrets: true });
  expect(applyInstanceSetting(saved, { ...draft, profile: "other" }, "profile")).toEqual({ ...saved, profile: "other" });
});

import { expect, test } from "bun:test";
import { applyScreenPanel } from "../apps/web/components/settings/screen-draft";

const saved = { id: "old", config: { name: "Saved", allProfiles: true, profileIds: [], theme: "inherit" as const, scale: 1 } };
const draft = { id: "new", config: { name: "Draft", allProfiles: false, profileIds: ["shared"], theme: "night" as const, scale: 1.4 } };

test("screen panels save only their own fields without mutating either snapshot", () => {
  expect(applyScreenPanel(saved, draft, "identity")).toEqual({ id: "new", config: { ...saved.config, name: "Draft" } });
  expect(applyScreenPanel(saved, draft, "profiles")).toEqual({ id: "old", config: { ...saved.config, allProfiles: false, profileIds: ["shared"] } });
  expect(applyScreenPanel(saved, draft, "appearance")).toEqual({ id: "old", config: { ...saved.config, theme: "night", scale: 1.4 } });
  expect(saved.id).toBe("old");
  expect(saved.config.scale).toBe(1);
});

test("subsequent panel saves retain a committed rename and leave remaining drafts dirty", () => {
  const renamed = applyScreenPanel(saved, draft, "identity");
  const appearance = applyScreenPanel(renamed, draft, "appearance");
  expect(appearance.id).toBe("new");
  expect(appearance.config.name).toBe("Draft");
  expect(appearance.config.allProfiles).toBe(true);
  expect(appearance).not.toEqual(draft);
  expect(applyScreenPanel(appearance, draft, "profiles")).toEqual(draft);
});

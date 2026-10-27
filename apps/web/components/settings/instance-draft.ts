import type { Json, SettingsBlock } from "@peekapp/sdk";

type Binding = { connectionId: string; dataset: string };
export type InstanceDraft = {
  name: string;
  profile: string;
  enabled: boolean;
  settings: Record<string, Json>;
  bindings: Record<string, Binding[]>;
  secrets: Record<string, Json>;
  changeSecrets: boolean;
};
export type InstanceSetting =
  | "create"
  | `block:${string}`
  | "name"
  | "profile"
  | "enabled"
  | `bindings:${string}`;

/** Only the submitted card enters the saved snapshot; other drafts stay local. */
export function applyInstanceSetting(
  saved: InstanceDraft,
  draft: InstanceDraft,
  setting: InstanceSetting,
  blocks: SettingsBlock[] = [],
): InstanceDraft {
  if (setting === "create") return draft;
  if (setting.startsWith("block:")) {
    const block = blocks.find((block) => block.id === setting.slice(6));
    if (!block) throw new Error("unknown-settings-block");
    if (block.source === "secrets")
      return {
        ...saved,
        secrets: draft.secrets,
        changeSecrets: draft.changeSecrets,
      };
    const settings = { ...saved.settings };
    for (const control of block.controls ?? []) {
      if (
        control.type === "text" ||
        control.type === "readonly" ||
        control.disabled
      )
        continue;
      if (control.field in draft.settings)
        settings[control.field] = draft.settings[control.field];
      else delete settings[control.field];
    }
    return { ...saved, settings };
  }
  if (setting.startsWith("bindings:")) {
    const key = setting.slice(9);
    return {
      ...saved,
      bindings: { ...saved.bindings, [key]: draft.bindings[key] ?? [] },
    };
  }
  if (setting === "name") return { ...saved, name: draft.name };
  if (setting === "profile") return { ...saved, profile: draft.profile };
  return { ...saved, enabled: draft.enabled };
}

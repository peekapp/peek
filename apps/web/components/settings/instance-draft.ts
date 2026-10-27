import type { Json } from "@peekapp/sdk";

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
export type InstanceSetting = "name" | "profile" | "enabled" | "secrets" | `settings:${string}` | `bindings:${string}`;

/** Only the submitted card enters the saved snapshot; other drafts stay local. */
export function applyInstanceSetting(saved: InstanceDraft, draft: InstanceDraft, setting: InstanceSetting): InstanceDraft {
  if (setting.startsWith("settings:")) {
    const key = setting.slice(9);
    const settings = { ...saved.settings };
    if (key in draft.settings) settings[key] = draft.settings[key];
    else delete settings[key];
    return { ...saved, settings };
  }
  if (setting.startsWith("bindings:")) {
    const key = setting.slice(9);
    return { ...saved, bindings: { ...saved.bindings, [key]: draft.bindings[key] ?? [] } };
  }
  if (setting === "secrets") return { ...saved, secrets: draft.secrets, changeSecrets: draft.changeSecrets };
  if (setting === "name") return { ...saved, name: draft.name };
  if (setting === "profile") return { ...saved, profile: draft.profile };
  return { ...saved, enabled: draft.enabled };
}

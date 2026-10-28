import type { ScreenConfig } from "@peek/core/screens";

export type ScreenPanel = "identity" | "profiles" | "appearance";
type ScreenDraft = { id: string; config: ScreenConfig };

export function applyScreenPanel(saved: ScreenDraft, draft: ScreenDraft, panel: ScreenPanel): ScreenDraft {
  const { name, allProfiles, profileIds, theme, scale } = draft.config;
  return {
    id: panel === "identity" ? draft.id : saved.id,
    config: { ...saved.config, ...(panel === "identity" ? { name } : panel === "profiles" ? { allProfiles, profileIds } : { theme, scale }) },
  };
}

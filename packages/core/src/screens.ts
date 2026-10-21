export type ScreenConfig = {
  name: string;
  allProfiles: boolean;
  profileIds: string[];
  theme: "night" | "day";
  scale: number;
};
export type Screen = ScreenConfig & { id: string };
export function validateScreen(input: unknown): ScreenConfig {
  const v = input as ScreenConfig;
  if (
    !v ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.trim().length > 100 ||
    typeof v.allProfiles !== "boolean" ||
    !Array.isArray(v.profileIds) ||
    v.profileIds.length > 100 ||
    v.profileIds.some((id) => typeof id !== "string") ||
    !["night", "day"].includes(v.theme) ||
    ![0.8, 1, 1.2, 1.4].includes(v.scale)
  )
    throw new Error("invalid-screen");
  return {
    name: v.name.trim(),
    allProfiles: v.allProfiles,
    profileIds: v.allProfiles ? [] : [...new Set(v.profileIds)],
    theme: v.theme,
    scale: v.scale,
  };
}

export function validateScreenId(id: unknown): string {
  if (
    typeof id !== "string" ||
    id.length > 64 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
    id === "new"
  )
    throw new Error("invalid-screen-id");
  return id;
}
export function suggestScreenId(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/g, "");
}

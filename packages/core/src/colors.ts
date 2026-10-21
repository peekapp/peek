export const profileColors = {
  blue: "#96b6dc",
  pink: "#ce9bba",
  green: "#95b89e",
  purple: "#b7a0df",
  violet: "#d3a0df",
  cyan: "#83c9da",
  teal: "#83c6b8",
  lime: "#bacd86",
  yellow: "#dfcc83",
  orange: "#d9ae85",
  red: "#dc9696",
  gray: "#b2bac8",
} as const;
export type ProfileColor = keyof typeof profileColors;
export function isProfileColor(value: unknown): value is ProfileColor {
  return typeof value === "string" && Object.hasOwn(profileColors, value);
}

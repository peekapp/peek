import { messages, type Locale } from "./i18n";

// Keep the original IDs so saved screen configurations remain compatible.
export const themes = [
  "night",
  "oled",
  "day",
  "midnight",
  "graphite",
  "forest",
  "ocean",
  "plum",
  "sand",
  "lavender",
  "ice",
] as const;
export type Theme = (typeof themes)[number];
export type ScreenTheme = Theme | "inherit";
export function isLightTheme(theme: Theme): boolean {
  return ["day", "sand", "lavender", "ice"].includes(theme);
}
export const defaultTheme: Theme = "night";
export function isTheme(value: unknown): value is Theme {
  return themes.some((theme) => theme === value);
}
export function resolveTheme(
  screen: ScreenTheme | undefined,
  app: Theme = defaultTheme,
): Theme {
  return screen && screen !== "inherit" ? screen : app;
}
const themeMessageKeys = {
  night: "themeNight",
  oled: "themeOled",
  day: "themeDay",
  midnight: "themeMidnight",
  graphite: "themeGraphite",
  forest: "themeForest",
  ocean: "themeOcean",
  plum: "themePlum",
  sand: "themeSand",
  lavender: "themeLavender",
  ice: "themeIce",
  inherit: "themeInherit",
} as const;
export function themeName(theme: ScreenTheme, locale: Locale) {
  return messages(locale)[themeMessageKeys[theme]];
}

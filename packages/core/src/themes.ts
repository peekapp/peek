import type { Locale } from "./i18n";

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
const names = {
  en: {
    night: "Standard",
    oled: "OLED",
    day: "Light",
    midnight: "Midnight",
    graphite: "Graphite",
    forest: "Forest",
    ocean: "Ocean",
    plum: "Plum",
    sand: "Sand",
    lavender: "Lavender",
    ice: "Ice",
    inherit: "Use app theme",
  },
  ru: {
    night: "Стандартная",
    oled: "OLED",
    day: "Светлая",
    midnight: "Тёмно-синяя",
    graphite: "Графитовая",
    forest: "Лесная",
    ocean: "Океан",
    plum: "Сливовая",
    sand: "Песочная",
    lavender: "Лавандовая",
    ice: "Ледяная",
    inherit: "Как в приложении",
  },
};
export function themeName(theme: ScreenTheme, locale: Locale) {
  return names[locale][theme];
}

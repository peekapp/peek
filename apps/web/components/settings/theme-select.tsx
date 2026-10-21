"use client";
import {
  themes,
  themeName,
  isTheme,
  type ScreenTheme,
} from "@peek/core/themes";
import type { Locale } from "@peek/core/i18n";
import { SettingsSelect } from "./select";
import { SelectItem } from "../ui/select";

export function ThemeSelect({
  value,
  onValueChange,
  locale,
  inherit = false,
  disabled = false,
  id,
}: {
  value: ScreenTheme;
  onValueChange: (value: ScreenTheme) => void;
  locale: Locale;
  inherit?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <SettingsSelect
      id={id}
      value={value}
      disabled={disabled}
      aria-label={locale === "ru" ? "Тема оформления" : "Appearance theme"}
      onValueChange={(value) => {
        if (isTheme(value) || (inherit && value === "inherit"))
          onValueChange(value);
      }}
    >
      {(inherit ? ["inherit" as const, ...themes] : themes).map((theme) => (
        <SelectItem key={theme} value={theme}>
          <span className="theme-option">
            {theme !== "inherit" ? (
              <span
                aria-hidden="true"
                className="theme-swatch"
                data-theme={theme}
              >
                <i />
              </span>
            ) : null}
            {themeName(theme, locale)}
          </span>
        </SelectItem>
      ))}
    </SettingsSelect>
  );
}

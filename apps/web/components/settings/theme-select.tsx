"use client";
import {
  themes,
  themeName,
  isTheme,
  type ScreenTheme,
} from "@peek/core/themes";
import { messages, type Locale } from "@peek/core/i18n";
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
      aria-label={messages(locale).appearanceTheme}
      onValueChange={(value) => {
        if (isTheme(value) || (inherit && value === "inherit"))
          onValueChange(value);
      }}
    >
      {(inherit ? ["inherit" as const, ...themes] : themes).map((theme) => (
        <SelectItem key={theme} value={theme}>
          <span className="inline-flex items-center gap-2.5">
            {theme !== "inherit" ? (
              <span
                aria-hidden="true"
                className="inline-flex h-4.5 w-6 items-center rounded border border-border bg-background p-0.5"
                data-theme={theme}
              >
                <i className="h-2.5 w-2 rounded-sm bg-foreground" />
              </span>
            ) : null}
            {themeName(theme, locale)}
          </span>
        </SelectItem>
      ))}
    </SettingsSelect>
  );
}

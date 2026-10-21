import { ThemeProvider } from "../components/theme";
import { defaultTheme, isLightTheme, type Theme } from "@peek/core/themes";
import { installationTimeZone } from "@peek/db";
import { TimeZoneProvider } from "../components/time-zone";
import type { Metadata } from "next";
import "./globals.css";
import { readState } from "../lib/server-state";

export const metadata: Metadata = {
  title: "Peek",
  description: "Meetings and deadlines that need your attention.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let locale = "en";
  let theme: Theme = defaultTheme;
  try {
    const state = readState();
    locale = state.locale ?? "en";
    theme = state.theme ?? defaultTheme;
  } catch {}
  return (
    <html
      lang={locale}
      data-theme={theme}
      className={isLightTheme(theme) ? undefined : "dark"}
    >
      <body>
        <ThemeProvider initialTheme={theme}>
          <TimeZoneProvider value={installationTimeZone()}>
            {children}
          </TimeZoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

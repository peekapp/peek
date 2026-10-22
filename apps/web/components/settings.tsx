"use client";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "./ui/navigation-menu";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { useAppTheme } from "./theme";
import { ThemeSelect } from "./settings/theme-select";
import type { Theme } from "@peek/core/themes";
import { SettingsSelect } from "./settings/select";
import { SelectItem } from "./ui/select";
import { Brand } from "./brand";
import type { Screen } from "@peek/core/screens";
import { ScreenEditor, ScreenList } from "./settings/screen-editor";
import { profileName, type Profile } from "@peek/core/profiles";
import { ProfileEditor } from "./settings/profile-editor";
import { profileColors } from "@peek/core/colors";
import Link from "next/link";
import { useEffect, useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import { Extensions } from "./settings/extensions";
import { mutate } from "./settings/api";
type Data = {
  theme: Theme;
  screens: Screen[];
  profiles: Profile[];
  scenarios: { id: string; profileId: string }[];
  connections: { id: string; profileId: string }[];
  locale: Locale;
};
export function Settings({
  initialLocale = "en",
  path = [],
  packageId,
}: {
  initialLocale?: Locale;
  path?: string[];
  packageId?: string;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(false);
  const { theme, setTheme } = useAppTheme();
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeStatus, setThemeStatus] = useState<"saved" | "error" | "">("");
  const t = messages(locale),
    tab = path[0] ?? "screens",
    item = path[1];
  async function refresh() {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const next = (await res.json()) as Data;
      setData(next);
      setTheme(next.theme);
      setLocale(next.locale ?? "en");
      setError(false);
    } catch {
      setError(true);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const profile = data?.profiles.find((p) => p.id === item);
  return (
    <main className="settings-page">
      <header className="settings-header">
        <Link className="settings-brand" href="/">
          <Brand />
        </Link>
        <Link href="/">← {t.screen}</Link>
      </header>
      <div className="settings-heading">
        <h1>{t.settings}</h1>
      </div>
      <NavigationMenu
        className="settings-tabs"
        aria-label={t.settings}
        viewport={false}
      >
        <NavigationMenuList>
          {(
            [
              "screens",
              "scenarios",
              "connections",
              "profiles",
              "general",
              "extensions",
            ] as const
          ).map((key) => (
            <NavigationMenuItem key={key}>
              <NavigationMenuLink asChild variant="tab" active={tab === key}>
                <Link
                  href={`/settings/${key}`}
                  aria-current={tab === key ? "page" : undefined}
                >
                  {t[key]}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span>{t.loadError}</span>
            <Button variant="outline" onClick={refresh}>
              {t.retry}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="settings-content">
        {tab === "general" ? (
          <>
            <div className="section-intro">
              <h2>{t.general}</h2>
              <p>{t.generalDescription}</p>
            </div>
            <div className="preference-row">
              <div>
                <h3>{t.appTheme}</h3>
                <p>{t.appThemeHint}</p>
              </div>
              <div className="theme-preference-control">
                <ThemeSelect
                  value={theme}
                  locale={locale}
                  disabled={!data || themeBusy}
                  onValueChange={async (value) => {
                    if (value === "inherit") return;
                    setThemeBusy(true);
                    setThemeStatus("");
                    try {
                      await mutate({ action: "theme", theme: value });
                      await refresh();
                      setThemeStatus("saved");
                    } catch {
                      setThemeStatus("error");
                    } finally {
                      setThemeBusy(false);
                    }
                  }}
                />
                <p role="status" className="form-feedback">
                  {themeBusy
                    ? t.saving
                    : themeStatus === "saved"
                      ? t.saved
                      : themeStatus === "error"
                        ? t.loadError
                        : ""}
                </p>
              </div>
            </div>
            <div className="preference-row">
              <div>
                <h3>{t.language}</h3>
                <p>{t.languageHint}</p>
              </div>
              <SettingsSelect
                className="w-[170px] shrink-0"
                aria-label={t.language}
                value={locale}
                onValueChange={async (value) => {
                  try {
                    await mutate({ action: "locale", locale: value });
                    setLocale(value as Locale);
                  } catch {
                    setError(true);
                  }
                }}
              >
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
              </SettingsSelect>
            </div>
          </>
        ) : !data ? (
          <p>{t.loading}</p>
        ) : tab === "screens" ? (
          item ? (
            item === "new" || data.screens.some((s) => s.id === item) ? (
              <ScreenEditor
                key={item}
                screen={data.screens.find((s) => s.id === item)}
                profiles={data.profiles}
                locale={locale}
                refresh={refresh}
              />
            ) : (
              <p>{t.notFound}</p>
            )
          ) : (
            <ScreenList
              screens={data.screens}
              profiles={data.profiles}
              locale={locale}
            />
          )
        ) : tab === "profiles" ? (
          item ? (
            profile || item === "new" ? (
              <ProfileEditor
                key={item}
                profile={profile}
                locale={locale}
                refresh={refresh}
              />
            ) : (
              <p>{t.notFound}</p>
            )
          ) : (
            <>
              <div className="section-intro">
                <div>
                  <h2>{t.profiles}</h2>
                  <p>{t.profilesDescription}</p>
                </div>
                <Button asChild>
                  <Link href="/settings/profiles/new">+ {t.addProfile}</Link>
                </Button>
              </div>
              <div className="settings-card-grid">
                {data.profiles.map((p) => (
                  <Card variant="settings" asChild key={p.id}>
                    <Link href={`/settings/profiles/${p.id}`}>
                      <CardHeader>
                        <div className={`owner owner--${p.color}`}>
                          <i
                            aria-hidden="true"
                            style={{
                              backgroundColor: profileColors[p.color],
                            }}
                          />
                          {p.system ? t.systemProfile : t.profiles}
                        </div>
                        <CardTitle asChild>
                          <h3>{profileName(p, locale)}</h3>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="card-source">
                        {t.connections}:{" "}
                        {
                          data.connections.filter((c) => c.profileId === p.id)
                            .length
                        }{" "}
                        · {t.scenarios}:{" "}
                        {
                          data.scenarios.filter((s) => s.profileId === p.id)
                            .length
                        }
                      </CardContent>
                    </Link>
                  </Card>
                ))}
              </div>
            </>
          )
        ) : tab === "scenarios" || tab === "connections" ? (
          <Extensions
            key={`${tab}/${item ?? ""}/${packageId ?? ""}`}
            itemId={item}
            packageId={packageId}
            locale={locale}
            kind={tab === "scenarios" ? "scenario" : "integration"}
            embedded
          />
        ) : null}
      </div>
    </main>
  );
}

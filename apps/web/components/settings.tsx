"use client";
import { LoadingState, ErrorState, SettingsEmpty } from "./settings/layout";
import {
  FormFeedback,
  SettingsNavigation,
  SettingsPage,
  SettingsTitle,
  SettingsTopbar,
} from "./settings/layout";
import { NavigationMenuItem, NavigationMenuLink } from "./ui/navigation-menu";
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
import { type Profile } from "@peek/core/profiles";
import { ProfileEditor } from "./settings/profile-editor";
import { ProfileLabel } from "./profile-label";
import {
  SettingsHeading,
  SettingsGrid,
  SettingsCard,
  PreferenceRow,
} from "./settings/layout";
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
    <SettingsPage>
      <SettingsTopbar>
        <Link className="text-foreground" href="/">
          <Brand />
        </Link>
        <Link href="/">← {t.screen}</Link>
      </SettingsTopbar>
      <SettingsTitle>{t.settings}</SettingsTitle>
      <SettingsNavigation aria-label={t.settings} viewport={false}>
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
      </SettingsNavigation>
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
      <div className="pt-8">
        {tab === "general" ? (
          <>
            <SettingsHeading
              title={t.general}
              description={t.generalDescription}
            />
            <PreferenceRow title={t.appTheme} description={t.appThemeHint}>
              <div className="w-56 max-w-full shrink-0">
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
                <FormFeedback role="status">
                  {themeBusy
                    ? t.saving
                    : themeStatus === "saved"
                      ? t.saved
                      : themeStatus === "error"
                        ? t.loadError
                        : ""}
                </FormFeedback>
              </div>
            </PreferenceRow>
            <PreferenceRow title={t.language} description={t.languageHint}>
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
            </PreferenceRow>
          </>
        ) : !data ? (
          error ? null : (
            <LoadingState>{t.loading}</LoadingState>
          )
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
              <SettingsEmpty title={t.notFound} />
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
              <SettingsEmpty title={t.notFound} />
            )
          ) : (
            <>
              <SettingsHeading
                title={t.profiles}
                description={t.profilesDescription}
                action={
                  <Button asChild>
                    <Link href="/settings/profiles/new">+ {t.addProfile}</Link>
                  </Button>
                }
              />
              <SettingsGrid>
                {data.profiles.map((p) => (
                  <SettingsCard
                    key={p.id}
                    title={
                      <Link href={`/settings/profiles/${p.id}`}>
                        <ProfileLabel profile={p} locale={locale} />
                      </Link>
                    }
                    description={p.system ? t.systemProfile : t.profiles}
                    actions={
                      <Button variant="outline" asChild>
                        <Link href={`/settings/profiles/${p.id}`}>
                          {locale === "ru" ? "Изменить" : "Edit"}
                        </Link>
                      </Button>
                    }
                  >
                    <div className="text-sm text-detail wrap-anywhere">
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
                    </div>
                  </SettingsCard>
                ))}
              </SettingsGrid>
            </>
          )
        ) : tab === "extensions" ? (
          <Extensions locale={locale} />
        ) : tab === "scenarios" || tab === "connections" ? (
          <Extensions
            key={`${tab}/${item ?? ""}/${packageId ?? ""}`}
            itemId={item}
            packageId={packageId}
            locale={locale}
            kind={tab === "scenarios" ? "scenario" : "integration"}
          />
        ) : null}
      </div>
    </SettingsPage>
  );
}

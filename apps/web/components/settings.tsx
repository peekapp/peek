"use client";
import { toast } from "sonner";
import { LoadingState, SettingsEmpty } from "./settings/layout";
import {
  EditorHeader,
  FormFeedback,
  SettingsNavigation,
  SettingsPage,
  SettingsToolbar,
  SettingsCollection,
  SearchEmpty,
  matchesSearch,
} from "./settings/layout";
import { NavigationMenuItem, NavigationMenuLink } from "./ui/navigation-menu";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { useAppTheme } from "./theme";
import { ThemeSelect } from "./settings/theme-select";
import type { Theme } from "@peek/core/themes";
import { SettingsSelect } from "./settings/select";
import { SelectItem } from "./ui/select";
import { AppShell } from "./app-shell";
import type { Screen } from "@peek/core/screens";
import { ScreenEditor, ScreenList } from "./settings/screen-editor";
import { profileName, type Profile } from "@peek/core/profiles";
import { ProfileEditor } from "./settings/profile-editor";
import { SettingsGrid } from "./settings/layout";
import { ProfileCard } from "./settings/profile-card";
import { SettingsRowMenu } from "./settings/row-menu";
import { PreferenceRow } from "./settings/layout";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import { Extensions, type Status } from "./settings/extensions";
import { mutate, errorText } from "./settings/api";
type Data = {
  theme: Theme;
  screens: Screen[];
  profiles: Profile[];
  scenarios: { id: string; profileId: string }[];
  connections: { id: string; profileId: string }[];
  locale: Locale;
};
export function Settings({
  initialData = null,
  initialExtensions = null,
  path = [],
  packageId,
}: {
  initialData?: Data | null;
  initialExtensions?: Status | null;
  path?: string[];
  packageId?: string;
}) {
  const [query, setQuery] = useState("");
  const [editorTitle, setEditorTitle] = useState(initialExtensions?.instances.find((instance) => instance.id === path[1])?.name);
  const [profileDeleting, setProfileDeleting] = useState(false);
  const [locale, setLocale] = useState<Locale>(initialData?.locale ?? "en"),
    [data, setData] = useState<Data | null>(initialData),
    [error, setError] = useState(false);
  const { theme, setTheme } = useAppTheme();
  const refreshVersion = useRef(0);
  const preferenceSaves = useRef(0);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeStatus, setThemeStatus] = useState<"error" | "">("");
  const t = messages(locale),
    tab = path[0] ?? "general",
    item = path[1];
  async function refresh() {
    if (preferenceSaves.current) return;
    const version = ++refreshVersion.current;
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const next = (await res.json()) as Data;
      if (version !== refreshVersion.current) return;
      setData(next);
      setTheme(next.theme);
      setLocale(next.locale ?? "en");
      setError(false);
    } catch {
      if (version !== refreshVersion.current) return;
      setError(true);
    }
  }
  useEffect(() => {
    void refresh();
    // A remote deletion must not unmount an editor and discard its draft.
    const timer = item ? undefined : setInterval(refresh, 5000);
    return () => {
      refreshVersion.current++;
      clearInterval(timer);
    };
  }, [item]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const profile = data?.profiles.find((p) => p.id === item);
  return (
    <AppShell
      locale={locale}
      detail={item && (tab === "scenarios" || tab === "connections") ? {
        label: editorTitle ?? (item === "new" ? t.configure : tab === "scenarios" ? t.scenarioSettings : t.connectionSettings),
        href: `/${tab}/${encodeURIComponent(item)}${packageId ? `?package=${encodeURIComponent(packageId)}` : ""}`,
      } : undefined}
      section={
        tab === "general" || tab === "extensions"
          ? "settings"
          : (tab as "screens" | "scenarios" | "connections" | "profiles")
      }
    >
      <SettingsPage>
        {tab === "general" || tab === "extensions" ? (
          <SettingsNavigation aria-label={t.settings}>
            {(["general", "extensions"] as const).map((key) => (
              <NavigationMenuItem key={key}>
                <NavigationMenuLink asChild variant="tab" active={tab === key}>
                  <Link
                    href={
                      key === "general" ? "/settings" : "/settings/extensions"
                    }
                    aria-current={tab === key ? "page" : undefined}
                  >
                    {t[key]}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </SettingsNavigation>
        ) : null}
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
        <div
          className={
            tab === "general" || tab === "extensions" ? "pt-4" : undefined
          }
        >
          {tab === "general" ? (
            <>
              <PreferenceRow title={t.appTheme} description={t.appThemeHint}>
                <div className="w-56 max-w-full shrink-0">
                  <ThemeSelect
                    value={theme}
                    locale={locale}
                    disabled={themeBusy}
                    onValueChange={async (value) => {
                      if (value === "inherit") return;
                      preferenceSaves.current++;
                      refreshVersion.current++;
                      setThemeBusy(true);
                      setThemeStatus("");
                      try {
                        await mutate({ action: "theme", theme: value });
                        setTheme(value);
                        toast.success(t.themeSaved);
                      } catch {
                        setThemeStatus("error");
                      } finally {
                        preferenceSaves.current--;
                        setThemeBusy(false);
                        void refresh();
                      }
                    }}
                  />
                  <FormFeedback role="status">
                    {themeBusy
                      ? t.saving
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
                    preferenceSaves.current++;
                    refreshVersion.current++;
                    try {
                      await mutate({ action: "locale", locale: value });
                      setLocale(value as Locale);
                      toast.success(messages(value as Locale).languageSaved);
                    } catch {
                      setError(true);
                    } finally {
                      preferenceSaves.current--;
                      void refresh();
                    }
                  }}
                >
                  <SelectItem value="en">{t.languageEnglish}</SelectItem>
                  <SelectItem value="ru">{t.languageRussian}</SelectItem>
                </SettingsSelect>
              </PreferenceRow>
            </>
          ) : tab === "screens" ? (
            item ? (
              item === "new" || data?.screens.some((s) => s.id === item) ? (
                <ScreenEditor
                  key={item}
                  screen={data?.screens.find((s) => s.id === item)}
                  profiles={data?.profiles ?? []}
                  profilesLoading={!data && !error}
                  locale={locale}
                  refresh={refresh}
                />
              ) : !data ? (
                <>
                  <EditorHeader
                    backHref="/screens"
                    backLabel={t.backToScreens}
                    title={t.edit}
                  />
                  {!error ? (
                    <LoadingState layout="editor">{t.loading}</LoadingState>
                  ) : null}
                </>
              ) : (
                <SettingsEmpty title={t.notFound} />
              )
            ) : (
              <ScreenList
                screens={data?.screens}
                profiles={data?.profiles ?? []}
                error={error}
                locale={locale}
              />
            )
          ) : tab === "profiles" ? (
            item ? (
              item === "new" || profile ? (
                <ProfileEditor
                  key={item}
                  profile={profile}
                  locale={locale}
                  refresh={refresh}
                />
              ) : !data ? (
                <>
                  <EditorHeader
                    backHref="/profiles"
                    backLabel={t.backToProfiles}
                    title={t.profiles}
                  />
                  {!error ? (
                    <LoadingState layout="editor">{t.loading}</LoadingState>
                  ) : null}
                </>
              ) : (
                <SettingsEmpty title={t.notFound} />
              )
            ) : (
              <SettingsCollection>
                <SettingsToolbar
                  query={query}
                  onQueryChange={setQuery}
                  placeholder={t.searchProfiles}
                  action={
                    <Button asChild>
                      <Link href="/profiles/new">+ {t.addProfile}</Link>
                    </Button>
                  }
                />
                {!data && !error ? (
                  <LoadingState layout="list">{t.loading}</LoadingState>
                ) : null}
                {data &&
                data.profiles.every(
                  (p) => !matchesSearch(query, profileName(p, locale)),
                ) ? (
                  <SearchEmpty locale={locale} />
                ) : null}
                <SettingsGrid variant="profiles">
                  {data?.profiles
                    .filter((p) => matchesSearch(query, profileName(p, locale)))
                    .map((p) => (
                      <ProfileCard
                        key={p.id}
                        profile={p}
                        locale={locale}
                        connectionCount={data.connections.filter((c) => c.profileId === p.id).length}
                        scenarioCount={data.scenarios.filter((s) => s.profileId === p.id).length}
                        actions={
                          <SettingsRowMenu
                          kind="profile"
                          href={`/profiles/${p.id}`}
                          locale={locale}
                          disabled={profileDeleting}
                          onDelete={p.system ? undefined : async () => {
                            setProfileDeleting(true);
                            try {
                              await mutate({ action: "profile-delete", id: p.id });
                              toast.success(t.profileDeleted);
                              await refresh();
                            } catch (error) {
                              throw new Error(errorText(error instanceof Error ? error.message : "error", locale));
                            } finally {
                              setProfileDeleting(false);
                            }
                          }}
                        />
                        }
                      />
                    ))}
                </SettingsGrid>
              </SettingsCollection>
            )
          ) : tab === "extensions" ? (
            <Extensions
              locale={locale}
              initialData={initialExtensions}
              initialProfiles={initialData?.profiles}
            />
          ) : tab === "scenarios" || tab === "connections" ? (
            <Extensions
              key={`${tab}/${item ?? ""}/${packageId ?? ""}`}
              initialData={initialExtensions}
              initialProfiles={initialData?.profiles}
              itemId={item}
              onEditorTitleChange={setEditorTitle}
              packageId={packageId}
              locale={locale}
              kind={tab === "scenarios" ? "scenario" : "connection"}
            />
          ) : null}
        </div>
      </SettingsPage>
    </AppShell>
  );
}

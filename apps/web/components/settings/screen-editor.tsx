"use client";
import { EditorForm, FormFeedback } from "./layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../ui/card";
import { resolveTheme } from "@peek/core/themes";
import { useAppTheme } from "../theme";
import { ThemeSelect } from "./theme-select";
import { DeleteButton } from "./delete-button";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Checkbox } from "../ui/checkbox";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldContent,
} from "../ui/field";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { suggestScreenId } from "@peek/core/screens";
import type { Screen, ScreenConfig } from "@peek/core/screens";
import { type Profile } from "@peek/core/profiles";
import { ProfileLabel } from "../profile-label";
import {
  LoadingState,
  SettingsToolbar,
  SettingsCollection,
  matchesSearch,
  SearchEmpty,
  SettingsGrid,
  SettingsCard,
  SettingsEmpty,
  EditorHeader,
  EditorSection,
  EditorActions,
} from "./layout";
import { messages, type Locale } from "@peek/core/i18n";
import { errorText, mutate } from "./api";

function ScreenPreview({
  config,
  locale,
}: {
  config: ScreenConfig;
  locale: Locale;
}) {
  const t = messages(locale);
  const { theme } = useAppTheme();
  return (
    <div
      className="min-w-0 rounded-xl bg-background p-4 text-foreground"
      data-theme={resolveTheme(config.theme, theme)}
      aria-label={t.preview}
    >
      <div className="mb-4 flex justify-between gap-3 text-xs">
        <span className="truncate">{config.name || t.screenName}</span>
        <span>12:45</span>
      </div>
      <div className="grid h-36 grid-cols-[1.6fr_1fr] gap-4" aria-hidden="true">
        <div className="flex min-w-0 flex-col items-start justify-between rounded-lg bg-surface p-4">
          <span className="text-xs">peek</span>
          <strong
            className="font-light leading-none tracking-tighter"
            style={{ fontSize: `${32 * config.scale}px` }}
          >
            10:00
          </strong>
          <i className="block h-1.5 w-3/4 rounded bg-muted-foreground opacity-45" />
        </div>
        <aside className="flex flex-col justify-around">
          <i className="block h-1.5 w-3/4 rounded bg-muted-foreground opacity-45" />
          <i className="block h-1.5 w-3/4 rounded bg-muted-foreground opacity-45" />
          <i className="block h-1.5 w-3/4 rounded bg-muted-foreground opacity-45" />
        </aside>
      </div>
    </div>
  );
}
export function ScreenList({
  screens,
  profiles,
  locale,
  error = false,
}: {
  screens?: Screen[];
  error?: boolean;
  profiles: Profile[];
  locale: Locale;
}) {
  const t = messages(locale);
  const [query, setQuery] = useState("");
  const filtered = screens?.filter((screen) =>
    matchesSearch(query, screen.name, screen.id),
  );
  return (
    <SettingsCollection>
      <SettingsToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder={locale === "ru" ? "Поиск экранов" : "Search screens"}
        action={
          <Button asChild>
            <Link href="/screens/new">+ {t.addScreen}</Link>
          </Button>
        }
      />
      {!screens && !error ? <LoadingState>{t.loading}</LoadingState> : null}
      <SettingsGrid>
        {filtered?.map((screen) => (
          <SettingsCard
            key={screen.id}
            title={
              <Link href={`/screens/${screen.id}/edit`}>{screen.name}</Link>
            }
            description={<code>/{screen.id}</code>}
            preview={
              <Link
                href={`/screens/${screen.id}/edit`}
                aria-label={screen.name}
              >
                <ScreenPreview config={screen} locale={locale} />
              </Link>
            }
            actions={
              <>
                <Button variant="outline" asChild>
                  <Link href={`/screens/${screen.id}/edit`}>
                    {t.editScreen}
                  </Link>
                </Button>
                <Button variant="ghost" asChild>
                  <Link
                    href={`/screens/${screen.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.openScreen} ↗
                  </Link>
                </Button>
              </>
            }
          >
            <div className="flex flex-wrap gap-3">
              {screen.allProfiles
                ? t.allProfiles
                : screen.profileIds.length
                  ? profiles
                    .filter((p) => screen.profileIds.includes(p.id))
                    .map((p) => (
                      <ProfileLabel key={p.id} profile={p} locale={locale} />
                    ))
                  : t.noScreenProfiles}
            </div>
          </SettingsCard>
        ))}
      </SettingsGrid>
      {screens && screens.length > 0 && !filtered?.length ? (
        <SearchEmpty locale={locale} />
      ) : null}
      {screens && !screens.length ? (
        <SettingsEmpty
          title={t.emptyScreens}
          description={t.screensDescription}
        />
      ) : null}
    </SettingsCollection>
  );
}
export function ScreenEditor({
  screen,
  profiles,
  profilesLoading = false,
  locale,
  refresh,
}: {
  screen?: Screen;
  profiles: Profile[];
  profilesLoading?: boolean;
  locale: Locale;
  refresh: () => Promise<void>;
}) {
  const t = messages(locale),
    router = useRouter();
  const [config, setConfig] = useState<ScreenConfig>(
    () =>
      screen ?? {
        name: "",
        allProfiles: true,
        profileIds: [],
        theme: "inherit",
        scale: 1,
      },
  );
  const [id, setId] = useState(screen?.id ?? "");
  const [idEdited, setIdEdited] = useState(!!screen);
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const update = (value: Partial<ScreenConfig>) => {
    setConfig((c) => ({ ...c, ...value }));
    setStatus("");
  };
  const selectedProfiles = profiles.filter((profile) =>
    config.profileIds.includes(profile.id),
  );
  const busy = status === "saving";
  const invalidId = ["invalid-screen-id", "screen-id-taken"].includes(status);
  const link = `${origin}/screens/${screen?.id ?? id}`;
  return (
    <div className="min-w-0">
      <EditorHeader
        title={screen?.name ?? t.addScreen}
        backHref="/screens"
        backLabel={t.backToScreens}
        action={
          screen ? (
            <Button variant="outline" asChild>
              <Link
                href={`/screens/${screen.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.openScreen} ↗
              </Link>
            </Button>
          ) : null
        }
      />
      <EditorForm
        draft={{ id, config }}
        locale={locale}
        layout="preview"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus("saving");
          try {
            const result = await mutate({
              action: "screen-save",
              id,
              previousId: screen?.id,
              config,
            });
            await refresh();
            setStatus("saved");
            if (!screen || screen.id !== result.id)
              router.replace(`/screens/${result.id}/edit`);
            return true;
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "error");
            return false;
          }
        }}
      >
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <div className="flex min-w-0 flex-col gap-8">
            <EditorSection title={t.screenIdentity}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="screen-name">{t.screenName}</FieldLabel>
                  <Input
                    id="screen-name"
                    required
                    maxLength={100}
                    value={config.name}
                    onChange={(e) => {
                      update({ name: e.target.value });
                      if (!idEdited) setId(suggestScreenId(e.target.value));
                    }}
                  />
                </Field>
                <Field data-invalid={invalidId}>
                  <FieldLabel htmlFor="screen-id">{t.screenId}</FieldLabel>
                  <Input
                    id="screen-id"
                    required
                    maxLength={64}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    aria-invalid={invalidId}
                    aria-describedby="screen-id-hint"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={id}
                    onChange={(e) => {
                      setId(e.target.value);
                      setIdEdited(true);
                      setStatus("");
                    }}
                  />
                  <FieldDescription id="screen-id-hint">
                    {t.screenIdHint}
                  </FieldDescription>
                  {screen && id !== screen.id ? (
                    <FieldDescription>{t.screenIdChanged}</FieldDescription>
                  ) : null}
                </Field>
              </FieldGroup>
            </EditorSection>
            <EditorSection>
              <FieldSet>
                <FieldLegend>{t.profiles}</FieldLegend>
                <FieldDescription>{t.screenProfilesHint}</FieldDescription>
                <Field orientation="horizontal">
                  <Checkbox
                    id="screen-all"
                    checked={config.allProfiles}
                    onCheckedChange={(checked) =>
                      update({ allProfiles: checked === true })
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="screen-all">
                      {t.allProfiles}
                    </FieldLabel>
                    <FieldDescription>{t.allProfilesHint}</FieldDescription>
                  </FieldContent>
                </Field>
                {profilesLoading ? (
                  <LoadingState layout="fields">{t.loading}</LoadingState>
                ) : null}
                <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {profiles.map((profile) => (
                    <Field
                      key={profile.id}
                      orientation="horizontal"
                      data-disabled={config.allProfiles}
                    >
                      <Checkbox
                        id={`screen-${profile.id}`}
                        disabled={config.allProfiles}
                        checked={
                          config.allProfiles ||
                          config.profileIds.includes(profile.id)
                        }
                        onCheckedChange={(checked) =>
                          update({
                            profileIds:
                              checked === true
                                ? [...config.profileIds, profile.id]
                                : config.profileIds.filter(
                                  (value) => value !== profile.id,
                                ),
                          })
                        }
                      />
                      <FieldLabel htmlFor={`screen-${profile.id}`}>
                        <ProfileLabel profile={profile} locale={locale} />
                      </FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
                {!config.allProfiles && !config.profileIds.length ? (
                  <FieldDescription>{t.noScreenProfiles}</FieldDescription>
                ) : null}
              </FieldSet>
            </EditorSection>
            <EditorSection title={t.appearance}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="screen-theme">
                    {t.screenTheme}
                  </FieldLabel>
                  <ThemeSelect
                    id="screen-theme"
                    value={config.theme}
                    locale={locale}
                    inherit
                    onValueChange={(theme) => update({ theme })}
                  />
                  <FieldDescription>{t.screenThemeHint}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>{t.screenScale}</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={String(config.scale)}
                    onValueChange={(value) => {
                      if (value) update({ scale: Number(value) });
                    }}
                    aria-label={t.screenScale}
                  >
                    {[0.8, 1, 1.2, 1.4].map((scale) => (
                      <ToggleGroupItem
                        key={scale}
                        value={String(scale)}
                        aria-label={`${Math.round(scale * 100)}%`}
                      >
                        {Math.round(scale * 100)}%
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              </FieldGroup>
            </EditorSection>
          </div>
          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
            <Card variant="preview">
              <CardHeader>
                <CardTitle asChild>
                  <h3>{t.preview}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScreenPreview config={config} locale={locale} />
              </CardContent>
              <CardDescription asChild>
                <p className="flex flex-wrap gap-3">
                  {config.allProfiles
                    ? t.allProfiles
                    : selectedProfiles.length
                      ? selectedProfiles.map((profile) => (
                        <ProfileLabel
                          key={profile.id}
                          profile={profile}
                          locale={locale}
                        />
                      ))
                      : t.noScreenProfiles}
                </p>
              </CardDescription>
            </Card>
            <div className="flex flex-col gap-3 text-xs text-muted-foreground">
              <Field>
                <FieldLabel htmlFor="screen-link">{t.screenLink}</FieldLabel>
                <Input
                  id="screen-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </Field>
              {screen ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopyStatus(t.copied);
                    } catch {
                      setCopyStatus(t.copyFailed);
                    }
                  }}
                >
                  {t.copyLink}
                </Button>
              ) : null}
              <p role="status">{copyStatus}</p>
            </div>
          </aside>
        </div>
        <EditorActions>
          <Button disabled={busy}>{busy ? t.saving : t.save}</Button>
          <Button variant="ghost" asChild>
            <Link href="/screens" data-discard-changes>
              {t.cancel}
            </Link>
          </Button>
          {screen ? (
            <DeleteButton
              locale={locale}
              description={t.confirmScreenDelete}
              disabled={busy}
              onConfirm={async () => {
                setStatus("saving");
                try {
                  await mutate({ action: "screen-delete", id: screen.id });
                  await refresh();
                  router.push("/screens");
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "error");
                }
              }}
            />
          ) : null}
        </EditorActions>
        <FormFeedback role="status">
          {status === "saved"
            ? t.saved
            : status && !busy
              ? errorText(status, locale)
              : ""}
        </FormFeedback>
      </EditorForm>
    </div>
  );
}

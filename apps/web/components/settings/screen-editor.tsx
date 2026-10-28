"use client";
import { toast } from "sonner";
import { EditorForm, FormFeedback } from "./layout";
import { resolveTheme } from "@peek/core/themes";
import { useAppTheme } from "../theme";
import { ThemeSelect } from "./theme-select";
import { SettingsRowMenu } from "./row-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton, InputGroupText } from "../ui/input-group";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Switch } from "../ui/switch";
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
  EditorPanel,
} from "./layout";
import { messages, type Locale } from "@peek/core/i18n";
import { applyScreenPanel, type ScreenPanel } from "./screen-draft";
import { validateScreen, validateScreenId } from "@peek/core/screens";
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
      className="min-w-0 rounded-md bg-background p-4 text-foreground"
      data-theme={resolveTheme(config.theme, theme)}
      aria-label={t.preview}
    >
      <div className="mb-4 flex justify-between gap-3 text-xs">
        <span className="truncate">{config.name || t.screenName}</span>
        <span>12:45</span>
      </div>
      <div className="grid h-36 grid-cols-[1.6fr_1fr] gap-4" aria-hidden="true">
        <div className="flex min-w-0 flex-col items-start justify-between rounded-md bg-secondary p-4">
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
        placeholder={t.searchScreens}
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
                  <Link href={`/screens/${screen.id}/edit`}>{t.edit}</Link>
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
  onSaved,
}: {
  screen?: Screen;
  profiles: Profile[];
  profilesLoading?: boolean;
  locale: Locale;
  onSaved: (screen: Screen) => void;
}) {
  const t = messages(locale),
    router = useRouter();
  const [config, setConfig] = useState<ScreenConfig>(
    () =>
      screen ? { name: screen.name, allProfiles: screen.allProfiles, profileIds: screen.profileIds, theme: screen.theme, scale: screen.scale } : {
        name: "",
        allProfiles: true,
        profileIds: [],
        theme: "inherit",
        scale: 1,
      },
  );
  const [id, setId] = useState(screen?.id ?? "");
  const [saved, setSaved] = useState({ id, config });
  const [activePanel, setActivePanel] = useState("identity");
  const [idEdited, setIdEdited] = useState(!!screen);
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const update = (value: Partial<ScreenConfig>) => {
    setConfig((c) => ({ ...c, ...value }));
    setStatus("");
  };
  const busy = status === "saving";
  const invalidId = ["invalid-screen-id", "screen-id-taken"].includes(status);
  const link = `${origin}/screens/${screen ? saved.id : id}`;
  const draft = { id, config };
  function panel(setting: "identity" | "profiles" | "appearance", title: string, description: string, children: ReactNode, headerAction?: ReactNode) {
    const next = applyScreenPanel(saved, draft, setting);
    const Container = screen ? "form" : "div";
    return <Container data-setting={setting}>
      <EditorPanel title={title} description={description} headerAction={headerAction}
        actions={screen ? <Button size="sm" type="submit" name="setting" value={setting}
          disabled={busy || JSON.stringify(next) === JSON.stringify(saved)}>
          {busy && activePanel === setting ? t.saving : t.save}
        </Button> : undefined}>
        {children}
        {activePanel === setting && status && !busy ? <FormFeedback role="alert">{errorText(status, locale)}</FormFeedback> : null}
      </EditorPanel>
    </Container>;
  }
  return (
    <div className="min-w-0">
      <EditorForm
        as={screen ? "div" : "form"}
        draft={draft}
        savedDraft={saved}
        locale={locale}
        layout="settings"
        onSubmit={async (e) => {
          e.preventDefault();
          const setting = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as ScreenPanel | undefined;
          if (screen && !setting) return false;
          setActivePanel(setting ?? "identity");
          setStatus("saving");
          try {
            const next = screen ? applyScreenPanel(saved, draft, setting!) : draft;
            const committed = { id: validateScreenId(next.id), config: validateScreen(next.config) };
            await mutate({ action: "screen-save", id: committed.id, previousId: screen ? saved.id : undefined, config: committed.config });
            setSaved(committed);
            if (!screen || setting === "identity") {
              setId(committed.id);
              setConfig((current) => ({ ...current, name: committed.config.name }));
            }
            if (!screen || setting === "profiles") {
              setConfig((current) => ({ ...current, allProfiles: committed.config.allProfiles, profileIds: committed.config.profileIds }));
            }
            setStatus("");
            toast.success(screen ? t.saved : t.screenCreated);
            if (!screen) router.replace("/screens");
            else {
              if (saved.id !== committed.id) window.history.replaceState(null, "", `/screens/${committed.id}/edit`);
              onSaved({ id: committed.id, ...committed.config });
            }
            return true;
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "error");
            return false;
          }
        }}
      >
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {panel("identity", t.screenIdentity, t.screenIdentityDescription, <>
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
                  <InputGroup>
                  <InputGroupAddon variant="prefix" className="max-w-1/2 min-w-0" title={`${origin}/screens/`}>
                    <InputGroupText id="screen-url-prefix" className="block truncate">{origin}/screens/</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="screen-id"
                    required
                    maxLength={64}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    aria-invalid={invalidId}
                    aria-describedby="screen-url-prefix screen-id-hint"
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
                  </InputGroup>
                  <FieldDescription id="screen-id-hint">
                    {t.screenIdHint}
                  </FieldDescription>
                  {screen && id !== saved.id ? (
                    <FieldDescription>{t.screenIdChanged}</FieldDescription>
                  ) : null}
                </Field>
              </FieldGroup>
            </>)}
            {panel("profiles", t.profiles, t.screenProfilesHint, <>
              <FieldSet>
                <FieldLegend className="sr-only">{t.profiles}</FieldLegend>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="screen-all">{t.allProfiles}</FieldLabel>
                    <FieldDescription>{t.allProfilesHint}</FieldDescription>
                  </FieldContent>
                  <Switch id="screen-all" checked={config.allProfiles}
                    onCheckedChange={(allProfiles) => update({ allProfiles })} />
                </Field>
                {profilesLoading ? (
                  <LoadingState layout="fields">{t.loading}</LoadingState>
                ) : null}
                <FieldGroup data-slot="checkbox-group">
                  {profiles.map((profile) => (
                    <FieldLabel key={profile.id} htmlFor={`screen-${profile.id}`}>
                    <Field orientation="horizontal" data-disabled={config.allProfiles}>
                      <FieldContent><ProfileLabel linked={false} profile={profile} locale={locale} /></FieldContent>
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
                    </Field>
                    </FieldLabel>
                  ))}
                </FieldGroup>
                {!config.allProfiles && !config.profileIds.length ? (
                  <FieldDescription>{t.noScreenProfiles}</FieldDescription>
                ) : null}
              </FieldSet>
            </>)}
            {panel("appearance", t.appearance, t.screenAppearanceDescription, <>
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
            </>)}
          </div>
          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
            {screen ? <div className="flex items-center justify-end gap-2"><Button size="sm" asChild>
              <Link href={`/screens/${saved.id}`} target="_blank" rel="noopener noreferrer">{t.openScreen}<ExternalLinkIcon aria-hidden="true" /></Link>
            </Button>
              <SettingsRowMenu kind="screen" locale={locale} disabled={busy} onDelete={async () => {
                setStatus("saving");
                try {
                  await mutate({ action: "screen-delete", id: saved.id });
                  toast.success(t.screenDeleted);
                  router.push("/screens");
                } catch (error) {
                  throw new Error(errorText(error instanceof Error ? error.message : "error", locale));
                } finally { setStatus(""); }
              }} />
            </div> : null}
            <EditorPanel title={t.preview} description={t.screenPreviewDescription}>
              <ScreenPreview config={config} locale={locale} />
              <Field>
                <FieldLabel htmlFor="screen-link">{t.screenLink}</FieldLabel>
                <InputGroup>
                <InputGroupInput
                  id="screen-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              {screen ? (
                <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  aria-label={t.copyLink}
                  title={t.copyLink}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      toast.success(t.copied);
                    } catch {
                      toast.error(t.copyFailed);
                    }
                  }}
                >
                  <CopyIcon aria-hidden="true" />
                </InputGroupButton>
                </InputGroupAddon>
              ) : null}
                </InputGroup>
              </Field>
            </EditorPanel>
          </aside>
        </div>
        {!screen ? <div className="mt-6"><Button disabled={busy}>{busy ? t.saving : t.settingsCreate}</Button></div> : null}
      </EditorForm>
    </div>
  );
}

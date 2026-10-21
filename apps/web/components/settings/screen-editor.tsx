"use client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
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
import { profileName, type Profile } from "@peek/core/profiles";
import { profileColors } from "@peek/core/colors";
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
      className="screen-preview"
      data-theme={resolveTheme(config.theme, theme)}
      aria-label={t.preview}
    >
      <div className="screen-preview-heading">
        <span>{config.name || t.screenName}</span>
        <span>12:45</span>
      </div>
      <div className="screen-preview-feed" aria-hidden="true">
        <div>
          <span>peek</span>
          <strong style={{ fontSize: `${32 * config.scale}px` }}>10:00</strong>
          <i />
        </div>
        <aside>
          <i />
          <i />
          <i />
        </aside>
      </div>
    </div>
  );
}
export function ScreenList({
  screens,
  profiles,
  locale,
}: {
  screens: Screen[];
  profiles: Profile[];
  locale: Locale;
}) {
  const t = messages(locale);
  return (
    <>
      <div className="section-intro">
        <div>
          <h2>{t.screens}</h2>
          <p>{t.screensDescription}</p>
        </div>
        <Button asChild>
          <Link href="/settings/screens/new">+ {t.addScreen}</Link>
        </Button>
      </div>
      <div className="screens-grid">
        {screens.map((screen) => (
          <Card variant="screen" key={screen.id}>
            <Link
              href={`/settings/screens/${screen.id}`}
              aria-label={screen.name}
            >
              <ScreenPreview config={screen} locale={locale} />
            </Link>
            <div className="screen-tile-body">
              <CardHeader>
                <div className="screen-tile-title">
                  <CardTitle asChild>
                    <h3>
                      <Link href={`/settings/screens/${screen.id}`}>
                        {screen.name}
                      </Link>
                    </h3>
                  </CardTitle>
                  <code>/{screen.id}</code>
                </div>
              </CardHeader>
              <CardDescription asChild>
                <p>
                  {screen.allProfiles
                    ? t.allProfiles
                    : profiles
                        .filter((p) => screen.profileIds.includes(p.id))
                        .map((p) => profileName(p, locale))
                        .join(", ") || t.noScreenProfiles}
                </p>
              </CardDescription>
              <CardFooter className="card-bottom">
                <Link href={`/settings/screens/${screen.id}`}>
                  {t.editScreen}
                </Link>
                <Link
                  href={`/screens/${screen.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.openScreen} ↗
                </Link>
              </CardFooter>
            </div>
          </Card>
        ))}
      </div>
      {!screens.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t.emptyScreens}</EmptyTitle>
            <EmptyDescription>{t.screensDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </>
  );
}
export function ScreenEditor({
  screen,
  profiles,
  locale,
  refresh,
}: {
  screen?: Screen;
  profiles: Profile[];
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
  const busy = status === "saving";
  const invalidId = ["invalid-screen-id", "screen-id-taken"].includes(status);
  const link = `${origin}/screens/${screen?.id ?? id}`;
  return (
    <div className="screen-editor">
      <Link className="back-link" href="/settings/screens">
        ← {t.backToScreens}
      </Link>
      <div className="editor-title">
        <h1>{screen?.name ?? t.addScreen}</h1>
        {screen ? (
          <Button variant="outline" asChild>
            <Link
              href={`/screens/${screen.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.openScreen} ↗
            </Link>
          </Button>
        ) : null}
      </div>
      <form
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
              router.replace(`/settings/screens/${result.id}`);
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "error");
          }
        }}
      >
        <div className="screen-editor-layout">
          <div className="screen-editor-fields">
            <section className="screen-form-section">
              <h2>{t.screenIdentity}</h2>
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
            </section>
            <section className="screen-form-section">
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
                <FieldGroup className="screen-profile-grid">
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
                        <span className="owner">
                          <i
                            style={{
                              backgroundColor: profileColors[profile.color],
                            }}
                          />
                          {profileName(profile, locale)}
                        </span>
                      </FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
                {!config.allProfiles && !config.profileIds.length ? (
                  <FieldDescription>{t.noScreenProfiles}</FieldDescription>
                ) : null}
              </FieldSet>
            </section>
            <section className="screen-form-section">
              <h2>{t.appearance}</h2>
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
            </section>
          </div>
          <aside className="screen-editor-aside">
            <Card variant="preview">
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t.preview}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScreenPreview config={config} locale={locale} />
              </CardContent>
              <CardDescription asChild>
                <p>
                  {config.allProfiles
                    ? t.allProfiles
                    : profiles
                        .filter((p) => config.profileIds.includes(p.id))
                        .map((p) => profileName(p, locale))
                        .join(", ") || t.noScreenProfiles}
                </p>
              </CardDescription>
            </Card>
            <div className="screen-link-panel">
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
        <div className="form-actions">
          <Button disabled={busy}>{busy ? t.saving : t.save}</Button>
          <Button variant="ghost" asChild>
            <Link href="/settings/screens">{t.cancel}</Link>
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
                  router.push("/settings/screens");
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "error");
                }
              }}
            />
          ) : null}
        </div>
        <p role="status" className="form-feedback">
          {status === "saved"
            ? t.saved
            : status && !busy
              ? errorText(status, locale)
              : ""}
        </p>
      </form>
    </div>
  );
}

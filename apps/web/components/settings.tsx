"use client";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";
import { Button } from "./ui/button";
import { SettingsSelect } from "./settings/select";
import { SelectItem } from "./ui/select";
import { Brand } from "./brand";
import { useInstallationTimeZone } from "./time-zone";
import type { Screen } from "@peek/core/screens";
import { ScreenEditor, ScreenList } from "./settings/screen-editor";
import { profileName, type Profile } from "@peek/core/profiles";
import { ProfileEditor } from "./settings/profile-editor";
import { profileColors } from "@peek/core/colors";
import Link from "next/link";
import { useEffect, useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import type { Scenario } from "@peek/core/scenarios";
import { relativeEventTime } from "@peek/core/time";
import { ScenarioEditor } from "./settings/scenario-editor";
import { CalendarEditor } from "./settings/calendar-editor";
import { DefinitionPicker } from "./settings/definition-picker";
import { ConnectionCheck } from "./settings/connection-check";
import { integrationDefinitions, type Connection } from "@peek/core/registry";
import { mutate } from "./settings/api";
type Data = {
  screens: Screen[];
  profiles: Profile[];
  scenarios: Scenario[];
  connections: Connection[];
  locale: Locale;
};
export function Settings({
  initialLocale = "en",
  path = [],
}: {
  initialLocale?: Locale;
  path?: string[];
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(false);
  const timeZone = useInstallationTimeZone();
  const t = messages(locale),
    tab = path[0] ?? "screens",
    item = path[1];
  async function refresh() {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const next = (await res.json()) as Data;
      setData(next);
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
  const sourceName = (id: string) =>
    data?.connections.find((c) => c.id === id)?.name ??
    (id === "demo-meetings"
      ? t.demoMeetings
      : id === "demo-deadlines"
        ? t.demoDeadlines
        : t.sourceMissing);
  const ownerName = (id?: string) => {
    const p = data?.profiles.find((p) => p.id === (id ?? "shared"));
    return p ? profileName(p, locale) : t.profileMissing;
  };
  const profile = data?.profiles.find((p) => p.id === item);
  const scenario = data?.scenarios.find((s) => s.id === item),
    calendar = data?.connections.find((c) => c.id === item);
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
      <nav className="settings-tabs" aria-label={t.settings}>
        {(
          [
            "screens",
            "scenarios",
            "connections",
            "profiles",
            "general",
          ] as const
        ).map((key) => (
          <Link
            key={key}
            href={`/settings/${key}`}
            aria-current={tab === key ? "page" : undefined}
          >
            {t[key]}
          </Link>
        ))}
      </nav>
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
                  <Link
                    className="settings-card"
                    key={p.id}
                    href={`/settings/profiles/${p.id}`}
                  >
                    <div className={`owner owner--${p.color}`}>
                      <i
                        aria-hidden="true"
                        style={{
                          backgroundColor: profileColors[p.color],
                        }}
                      />
                      {p.system ? t.systemProfile : t.profiles}
                    </div>
                    <h3>{profileName(p, locale)}</h3>
                    <div className="card-source">
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
                  </Link>
                ))}
              </div>
            </>
          )
        ) : tab === "scenarios" && item ? (
          scenario || item === "new-meetings" || item === "new-deadlines" ? (
            <ScenarioEditor
              key={item}
              scenario={scenario}
              definition={
                scenario?.definition ??
                (item === "new-meetings" ? "meetings" : "deadlines")
              }
              locale={locale}
              profiles={data.profiles}
              calendars={data.connections}
              refresh={refresh}
            />
          ) : (
            <p>{t.notFound}</p>
          )
        ) : tab === "connections" && item ? (
          calendar || item === "new" || item === "new-ical" ? (
            <CalendarEditor
              key={item}
              calendar={calendar}
              profiles={data.profiles}
              locale={locale}
              refresh={refresh}
            />
          ) : (
            <p>{t.notFound}</p>
          )
        ) : tab === "scenarios" ? (
          <>
            <div className="section-intro">
              <div>
                <h2>{t.scenarios}</h2>
                <p>{t.scenariosDescription}</p>
              </div>
              <DefinitionPicker kind="scenario" locale={locale} />
            </div>
            <div className="settings-card-grid">
              {data.scenarios.map((s) => (
                <Link
                  className="settings-card"
                  key={s.id}
                  href={`/settings/scenarios/${s.id}`}
                >
                  <div className="card-top">
                    <span className="type-icon">
                      {s.definition === "meetings" ? "◷" : "▤"}
                    </span>
                    <Badge
                      variant={
                        s.lastError
                          ? "destructive"
                          : s.enabled
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {s.lastError
                        ? t.needsAttention
                        : s.enabled
                          ? t.active
                          : t.disabled}
                    </Badge>
                  </div>
                  <h3>{s.name}</h3>
                  <p>
                    {t[s.definition]} · {ownerName(s.profileId)}
                  </p>
                  <div className="card-source">{sourceName(s.sourceId)}</div>
                  <div className="card-bottom">
                    <span>
                      {s.enabled && s.nextRunAt !== null
                        ? `${t.nextRun}: ${relativeEventTime(s.nextRunAt, Date.now(), locale, timeZone)}`
                        : s.enabled
                          ? t.waiting
                          : t.disabled}
                    </span>
                    <span aria-hidden="true">›</span>
                  </div>
                </Link>
              ))}
            </div>
            {!data.scenarios.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>{t.emptyScenarios}</EmptyTitle>
                  <EmptyDescription>{t.scenarioEmptyHint}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </>
        ) : tab === "connections" ? (
          <>
            <div className="section-intro">
              <div>
                <h2>{t.connections}</h2>
                <p>{t.connectionsDescription}</p>
              </div>
              <DefinitionPicker kind="connection" locale={locale} />
            </div>
            <div className="settings-card-grid">
              {data.connections.map((c) => (
                <article className="settings-card connection-card" key={c.id}>
                  <div className="card-top">
                    <span className="type-icon">▦</span>
                    <Badge
                      variant={
                        c.error
                          ? "destructive"
                          : c.lastSuccess
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {c.error
                        ? t.needsAttention
                        : c.lastSuccess === null
                          ? t.pending
                          : Date.now() - c.lastSuccess >
                              c.intervalSeconds * 2000 + 30000
                            ? t.stale
                            : t.connected}
                    </Badge>
                  </div>
                  <h3>
                    <Link href={`/settings/connections/${c.id}`}>{c.name}</Link>
                  </h3>
                  <p>
                    {
                      integrationDefinitions.find(
                        (d) => d.id === c.integrationId,
                      )?.name
                    }{" "}
                    · {ownerName(c.profileId)}
                  </p>
                  <div className="card-source">
                    {c.eventCount} {t.eventCount.toLowerCase()}
                  </div>
                  <div className="card-bottom">
                    <span>
                      {t.lastSync}:{" "}
                      {c.lastSuccess === null
                        ? t.never
                        : relativeEventTime(
                            c.lastSuccess,
                            Date.now(),
                            locale,
                            timeZone,
                          )}
                    </span>
                    <span aria-hidden="true">›</span>
                  </div>
                  <ConnectionCheck
                    key={`${c.id}:${c.version}`}
                    connection={c}
                    locale={locale}
                    refresh={refresh}
                  />
                </article>
              ))}
            </div>
            {!data.connections.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>{t.calendarEmpty}</EmptyTitle>
                  <EmptyDescription>{t.calendarEmptyHint}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

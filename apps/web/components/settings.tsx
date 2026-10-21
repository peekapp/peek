"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import type { Scenario } from "@peek/core/scenarios";
import type { CalendarConnection } from "@peek/core/calendars";
import { relativeEventTime } from "@peek/core/time";
import { ScenarioEditor } from "./settings/scenario-editor";
import { CalendarEditor } from "./settings/calendar-editor";
import { mutate } from "./settings/api";
type Data = {
  scenarios: Scenario[];
  calendars: CalendarConnection[];
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
  const t = messages(locale),
    tab = path[0] ?? "general",
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
    data?.calendars.find((c) => c.id === id)?.name ??
    (id === "demo-meetings"
      ? t.demoMeetings
      : id === "demo-deadlines"
        ? t.demoDeadlines
        : t.sourceMissing);
  const scenario = data?.scenarios.find((s) => s.id === item),
    calendar = data?.calendars.find((c) => c.id === item);
  return (
    <main className="settings-page">
      <header className="settings-header">
        <Link className="settings-brand" href="/">
          <img src="/peek-mark.svg" alt="" width={24} height={28} />
          <strong>peek</strong>
        </Link>
        <Link href="/">← {t.screen}</Link>
      </header>
      <div className="settings-heading">
        <h1>{t.settings}</h1>
      </div>
      <nav className="settings-tabs" aria-label={t.settings}>
        {(["general", "calendars", "scenarios"] as const).map((key) => (
          <Link
            key={key}
            href={`/settings/${key}`}
            aria-current={tab === key ? "page" : undefined}
          >
            {t[key]}
            {key === "scenarios" && data ? (
              <span>{data.scenarios.length}</span>
            ) : key === "calendars" && data ? (
              <span>{data.calendars.length}</span>
            ) : null}
          </Link>
        ))}
      </nav>
      {error ? (
        <div role="alert" className="system-warning">
          {t.loadError} <button onClick={refresh}>{t.retry}</button>
        </div>
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
              <select
                aria-label={t.language}
                value={locale}
                onChange={async (e) => {
                  try {
                    await mutate({ action: "locale", locale: e.target.value });
                    setLocale(e.target.value as Locale);
                  } catch {
                    setError(true);
                  }
                }}
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </div>
          </>
        ) : !data ? (
          <p>{t.loading}</p>
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
              calendars={data.calendars}
              refresh={refresh}
            />
          ) : (
            <p>{t.notFound}</p>
          )
        ) : tab === "calendars" && item ? (
          calendar || item === "new" ? (
            <CalendarEditor
              key={item}
              calendar={calendar}
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
              <div className="add-actions">
                <Link
                  className="button secondary-button"
                  href="/settings/scenarios/new-meetings"
                >
                  + {t.meetings}
                </Link>
                <Link
                  className="button secondary-button"
                  href="/settings/scenarios/new-deadlines"
                >
                  + {t.deadlines}
                </Link>
              </div>
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
                    <span
                      className={`status-badge ${s.lastError ? "status-error" : s.enabled ? "status-active" : ""}`}
                    >
                      {s.lastError
                        ? t.needsAttention
                        : s.enabled
                          ? t.active
                          : t.disabled}
                    </span>
                  </div>
                  <h3>{s.name}</h3>
                  <p>{t[s.definition]}</p>
                  <div className="card-source">{sourceName(s.sourceId)}</div>
                  <div className="card-bottom">
                    <span>
                      {s.enabled && s.nextRunAt !== null
                        ? `${t.nextRun}: ${relativeEventTime(s.nextRunAt, Date.now(), locale)}`
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
              <div className="settings-empty">
                <h3>{t.emptyScenarios}</h3>
                <p>{t.scenarioEmptyHint}</p>
              </div>
            ) : null}
          </>
        ) : tab === "calendars" ? (
          <>
            <div className="section-intro">
              <div>
                <h2>{t.calendars}</h2>
                <p>{t.calendarsDescription}</p>
              </div>
              <Link className="button" href="/settings/calendars/new">
                + {t.addCalendar}
              </Link>
            </div>
            <div className="settings-card-grid">
              {data.calendars.map((c) => (
                <Link
                  className="settings-card"
                  href={`/settings/calendars/${c.id}`}
                  key={c.id}
                >
                  <div className="card-top">
                    <span className="type-icon">▦</span>
                    <span
                      className={`status-badge ${c.error ? "status-error" : c.lastSuccess ? "status-active" : ""}`}
                    >
                      {c.error
                        ? t.needsAttention
                        : c.lastSuccess === null
                          ? t.pending
                          : Date.now() - c.lastSuccess >
                              c.intervalSeconds * 2000 + 30000
                            ? t.stale
                            : t.connected}
                    </span>
                  </div>
                  <h3>{c.name}</h3>
                  <p>{c.owner.name}</p>
                  <div className="card-source">
                    {c.eventCount} {t.eventCount.toLowerCase()}
                  </div>
                  <div className="card-bottom">
                    <span>
                      {t.lastSync}:{" "}
                      {c.lastSuccess === null
                        ? t.never
                        : relativeEventTime(c.lastSuccess, Date.now(), locale)}
                    </span>
                    <span aria-hidden="true">›</span>
                  </div>
                </Link>
              ))}
            </div>
            {!data.calendars.length ? (
              <div className="settings-empty">
                <span className="type-icon">▦</span>
                <h3>{t.calendarEmpty}</h3>
                <p>{t.calendarEmptyHint}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

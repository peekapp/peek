"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import {
  definitions,
  numericFields,
  type Scenario,
  type ScenarioConfig,
} from "@peek/core/scenarios";
import { relativeEventTime } from "@peek/core/time";
async function mutate(body: unknown) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(response.status === 400 ? "invalid" : "error");
}
function ScenarioForm({
  scenario,
  locale,
  refresh,
}: {
  scenario: Scenario;
  locale: Locale;
  refresh: () => void;
}) {
  const [config, setConfig] = useState<ScenarioConfig>(scenario);
  const [status, setStatus] = useState("");
  const t = messages(locale);
  const update = (patch: Partial<ScenarioConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setStatus("");
  };
  return (
    <form
      className="scenario-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("saving");
        try {
          await mutate({ action: "save", id: scenario.id, config });
          setStatus("saved");
          refresh();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "error");
        }
      }}
    >
      <div className="scenario-heading">
        <h2>{t[config.definition]}</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          {t.enabled}
        </label>
      </div>
      <div className="form-grid">
        <label>
          {t.name}
          <input
            required
            maxLength={100}
            value={config.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <label>
          {t.source}
          <select
            value={config.sourceId}
            onChange={(e) =>
              update({ sourceId: e.target.value as ScenarioConfig["sourceId"] })
            }
          >
            <option value="demo-meetings">{t.demoMeetings}</option>
            <option value="demo-deadlines">{t.demoDeadlines}</option>
          </select>
        </label>
        {numericFields.map((key) => (
          <label key={key}>
            {t[key]}
            <input
              required
              type="number"
              min={0}
              max={key === "retainMinutes" ? 1440 : 129600}
              step={1}
              value={config[key]}
              onChange={(e) =>
                update({
                  [key]: e.target.value === "" ? "" : Number(e.target.value),
                } as Partial<ScenarioConfig>)
              }
            />
          </label>
        ))}
        <label>
          {t.filterText}
          <input
            maxLength={200}
            value={config.filterText}
            onChange={(e) => update({ filterText: e.target.value })}
          />
        </label>
      </div>
      <div className="run-info">
        <span>
          {t.nextRun}:{" "}
          {!scenario.enabled
            ? t.disabled
            : scenario.nextRunAt === null
              ? t.waiting
              : relativeEventTime(scenario.nextRunAt, Date.now(), locale)}
        </span>
        <span>
          {t.lastRun}:{" "}
          {scenario.lastRunAt === null
            ? t.never
            : relativeEventTime(scenario.lastRunAt, Date.now(), locale)}
        </span>
      </div>
      {scenario.lastError ? <p className="form-error">{t.runError}</p> : null}
      <div className="form-actions">
        <button disabled={status === "saving"} type="submit">
          {status === "saving" ? t.saving : t.save}
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={async () => {
            if (!confirm(t.confirmDelete)) return;
            try {
              await mutate({ action: "delete", id: scenario.id });
              refresh();
            } catch {
              setStatus("error");
            }
          }}
        >
          {t.remove}
        </button>
        <span role="status">
          {status === "saved"
            ? t.saved
            : status === "invalid"
              ? t.invalid
              : status === "error"
                ? t.error
                : ""}
        </span>
      </div>
    </form>
  );
}
export function Settings({ initialLocale = "en" }: { initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const t = messages(locale);
  async function refresh() {
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setScenarios(data.scenarios);
      setLocale(data.locale ?? "en");
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
  return (
    <main className="settings-page">
      <header className="settings-header">
        <Link href="/">← {t.screen}</Link>
        <label>
          {t.language}
          <select
            aria-label={t.language}
            value={locale}
            onChange={async (e) => {
              try {
                const value = e.target.value;
                await mutate({ action: "locale", locale: value });
                setLocale(value as Locale);
              } catch {
                setError(true);
              }
            }}
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </label>
      </header>
      <h1>{t.scenarios}</h1>
      <p className="settings-caption">{t.localOnly}</p>
      {error ? (
        <div className="system-warning" role="alert">
          {t.loadError} <button onClick={refresh}>{t.retry}</button>
        </div>
      ) : null}
      {scenarios?.map((scenario) => (
        <ScenarioForm
          key={scenario.id}
          scenario={scenario}
          locale={locale}
          refresh={refresh}
        />
      ))}
      {scenarios?.length === 0 ? <p>{t.emptyScenarios}</p> : null}
      <div className="add-scenarios">
        {(["meetings", "deadlines"] as const).map((definition) => (
          <button
            key={definition}
            disabled={adding || scenarios === null}
            onClick={async () => {
              setAdding(true);
              try {
                await mutate({
                  action: "save",
                  config: {
                    definition,
                    name: t[definition],
                    sourceId:
                      definition === "meetings"
                        ? "demo-meetings"
                        : "demo-deadlines",
                    enabled: true,
                    filterText: "",
                    ...definitions[definition].defaults,
                  },
                });
                await refresh();
              } catch {
                setError(true);
              } finally {
                setAdding(false);
              }
            }}
          >
            + {t.add}: {t[definition]}
          </button>
        ))}
      </div>
    </main>
  );
}

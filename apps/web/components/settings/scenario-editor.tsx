"use client";
import type { Profile } from "@peek/core/profiles";
import { ProfileSelect } from "./profile-select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import {
  definitions,
  numericFields,
  type Scenario,
  type ScenarioConfig,
} from "@peek/core/scenarios";
import type { CalendarConnection } from "@peek/core/calendars";
import { relativeEventTime } from "@peek/core/time";
import { mutate, errorText } from "./api";
export function ScenarioEditor({
  scenario,
  definition,
  locale,
  calendars,
  profiles,
  refresh,
}: {
  scenario?: Scenario;
  definition: "meetings" | "deadlines";
  locale: Locale;
  calendars: CalendarConnection[];
  profiles: Profile[];
  refresh: () => Promise<void>;
}) {
  const t = messages(locale),
    router = useRouter();
  const [config, setConfig] = useState<ScenarioConfig>(
    scenario ?? {
      name: "",
      profileId: "shared",
      definition,
      enabled: true,
      sourceId: calendars[0]?.id ?? `demo-${definition}`,
      filterText: "",
      ...definitions[definition].defaults,
    },
  );
  const [status, setStatus] = useState("");
  const update = (patch: Partial<ScenarioConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setStatus("");
  };
  return (
    <>
      <Link className="back-link" href="/settings/scenarios">
        ← {t.backToScenarios}
      </Link>
      <div className="editor-title">
        <span className="type-icon">
          {definition === "meetings" ? "◷" : "▤"}
        </span>
        <div>
          <h1>{scenario?.name || t.newScenario}</h1>
          <p>{t[definition]}</p>
        </div>
      </div>
      <form
        className="detail-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus("saving");
          try {
            const result = await mutate({
              action: "save",
              id: scenario?.id,
              config,
            });
            setStatus("saved");
            await refresh();
            if (!scenario) router.replace(`/settings/scenarios/${result.id}`);
          } catch (e) {
            setStatus(e instanceof Error ? e.message : "error");
          }
        }}
      >
        <section className="form-section">
          <div>
            <h2>{t.scenarioBasics}</h2>
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
                onChange={(e) => update({ sourceId: e.target.value })}
              >
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="demo-meetings">{t.demoMeetings}</option>
                <option value="demo-deadlines">{t.demoDeadlines}</option>
              </select>
            </label>
            <ProfileSelect
              profiles={profiles}
              value={config.profileId ?? "shared"}
              locale={locale}
              onChange={(profileId) => update({ profileId })}
            />
            <label className="span-two">
              {t.filterText}
              <input
                maxLength={200}
                value={config.filterText}
                onChange={(e) => update({ filterText: e.target.value })}
              />
            </label>
          </div>
        </section>
        <section className="form-section">
          <h2>{t.scenarioRules}</h2>
          <div className="form-grid">
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
                      [key]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    } as Partial<ScenarioConfig>)
                  }
                />
              </label>
            ))}
          </div>
        </section>
        {scenario ? (
          <div className="execution-note">
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
            {scenario.lastError ? (
              <span className="form-error">{t.runError}</span>
            ) : null}
          </div>
        ) : null}
        <div className="form-actions">
          <button disabled={status === "saving"}>
            {status === "saving" ? t.saving : t.save}
          </button>
          <Link href="/settings/scenarios">{t.cancel}</Link>
          {scenario ? (
            <button
              type="button"
              className="quiet-button danger"
              onClick={async () => {
                if (!confirm(t.confirmDelete)) return;
                try {
                  await mutate({ action: "delete", id: scenario.id });
                  await refresh();
                  router.push("/settings/scenarios");
                } catch {
                  setStatus("error");
                }
              }}
            >
              {t.remove}
            </button>
          ) : null}
        </div>
        <p role="status" className="form-feedback">
          {status === "saved"
            ? t.saved
            : status && status !== "saving"
              ? errorText(status, locale)
              : ""}
        </p>
      </form>
    </>
  );
}

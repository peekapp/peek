"use client";
import { Label } from "../ui/label";
import { DeleteButton } from "./delete-button";
import { Button } from "../ui/button";
import { SettingsSelect } from "./select";
import { SelectItem } from "../ui/select";
import { Input } from "../ui/input";
import { SettingsField } from "./form-field";
import { FieldGroup } from "../ui/field";
import { Checkbox } from "../ui/checkbox";
import { useInstallationTimeZone } from "../time-zone";
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
  const timeZone = useInstallationTimeZone();
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
          <div className="form-section-heading">
            <h2>{t.scenarioBasics}</h2>
            <Label className="toggle">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={(checked) =>
                  update({ enabled: checked === true })
                }
              />
              {t.enabled}
            </Label>
          </div>
          <FieldGroup className="form-grid">
            <SettingsField label={t.name}>
              <Input
                required
                maxLength={100}
                value={config.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </SettingsField>
            <SettingsField label={t.source}>
              <SettingsSelect
                value={config.sourceId}
                onValueChange={(sourceId) => update({ sourceId })}
              >
                {calendars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
                <SelectItem value="demo-meetings">{t.demoMeetings}</SelectItem>
                <SelectItem value="demo-deadlines">
                  {t.demoDeadlines}
                </SelectItem>
              </SettingsSelect>
            </SettingsField>
            <ProfileSelect
              profiles={profiles}
              value={config.profileId ?? "shared"}
              locale={locale}
              onChange={(profileId) => update({ profileId })}
            />
            <SettingsField className="span-two" label={t.filterText}>
              <Input
                maxLength={200}
                value={config.filterText}
                onChange={(e) => update({ filterText: e.target.value })}
              />
            </SettingsField>
          </FieldGroup>
        </section>
        <section className="form-section">
          <h2>{t.scenarioRules}</h2>
          <FieldGroup className="form-grid">
            {numericFields.map((key) => (
              <SettingsField key={key} label={t[key]}>
                <Input
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
              </SettingsField>
            ))}
          </FieldGroup>
        </section>
        {scenario ? (
          <div className="execution-note">
            <span>
              {t.nextRun}:{" "}
              {!scenario.enabled
                ? t.disabled
                : scenario.nextRunAt === null
                  ? t.waiting
                  : relativeEventTime(
                      scenario.nextRunAt,
                      Date.now(),
                      locale,
                      timeZone,
                    )}
            </span>
            <span>
              {t.lastRun}:{" "}
              {scenario.lastRunAt === null
                ? t.never
                : relativeEventTime(
                    scenario.lastRunAt,
                    Date.now(),
                    locale,
                    timeZone,
                  )}
            </span>
            {scenario.lastError ? (
              <span className="form-error">{t.runError}</span>
            ) : null}
          </div>
        ) : null}
        <div className="form-actions">
          <Button disabled={status === "saving"}>
            {status === "saving" ? t.saving : t.save}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/settings/scenarios">{t.cancel}</Link>
          </Button>
          {scenario ? (
            <DeleteButton
              locale={locale}
              description={t.confirmDelete}
              disabled={status === "saving"}
              onConfirm={async () => {
                try {
                  await mutate({ action: "delete", id: scenario.id });
                  await refresh();
                  router.push("/settings/scenarios");
                } catch {
                  setStatus("error");
                }
              }}
            />
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

"use client";
import { DeleteButton } from "./delete-button";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsField } from "./form-field";
import { FieldGroup } from "../ui/field";
import { useInstallationTimeZone } from "../time-zone";
import type { Profile } from "@peek/core/profiles";
import { ProfileSelect } from "./profile-select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import type { CalendarConfig, CalendarConnection } from "@peek/core/calendars";
import { relativeEventTime } from "@peek/core/time";
import { mutate, errorText } from "./api";
import { ConnectionCheck } from "./connection-check";
export function CalendarEditor({
  calendar,
  profiles,
  locale,
  refresh,
}: {
  calendar?: CalendarConnection;
  profiles: Profile[];
  locale: Locale;
  refresh: () => Promise<void>;
}) {
  const timeZone = useInstallationTimeZone();
  const t = messages(locale),
    router = useRouter();
  const [config, setConfig] = useState<Omit<CalendarConfig, "timeZone">>(
    calendar ?? {
      name: "",
      profileId: "shared",
      owner: { name: "", color: "blue" },
      intervalSeconds: 60,
    },
  );
  const [url, setUrl] = useState(""),
    [status, setStatus] = useState("");
  const update = (patch: Partial<CalendarConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setStatus("");
  };
  return (
    <>
      <Link className="back-link" href="/settings/connections">
        ← {t.backToCalendars}
      </Link>
      <div className="editor-title">
        <span className="type-icon">▦</span>
        <div>
          <h1>{calendar?.name || t.newCalendar}</h1>
          <p>iCalendar</p>
        </div>
      </div>
      <form
        className="detail-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus("saving");
          try {
            const result = await mutate({
              action: "calendar-save",
              id: calendar?.id,
              config,
              url: url || undefined,
            });
            setUrl("");
            setStatus("saved");
            await refresh();
            if (!calendar) router.replace(`/settings/connections/${result.id}`);
          } catch (e) {
            setStatus(e instanceof Error ? e.message : "error");
          }
        }}
      >
        <section className="form-section">
          <h2>{t.calendarBasics}</h2>
          <FieldGroup className="form-grid">
            <SettingsField className="span-two" label={t.calendarName}>
              <Input
                required
                maxLength={100}
                value={config.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </SettingsField>
            <SettingsField className="span-two" label={t.calendarUrl}>
              <Input
                type="password"
                aria-label={t.calendarUrl}
                required={!calendar}
                autoComplete="new-password"
                maxLength={4096}
                value={url}
                placeholder={calendar ? "••••••••" : "https://…"}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setStatus("");
                }}
              />
              <small>{calendar ? t.urlSaved : t.urlHint}</small>
            </SettingsField>
            <ProfileSelect
              profiles={profiles}
              value={config.profileId ?? "shared"}
              locale={locale}
              onChange={(profileId) => update({ profileId })}
            />
          </FieldGroup>
        </section>
        <section className="form-section">
          <h2>{t.calendarSchedule}</h2>
          <FieldGroup className="form-grid">
            <SettingsField label={t.intervalSeconds}>
              <Input
                type="number"
                required
                min={60}
                max={86400}
                step={1}
                value={config.intervalSeconds}
                onChange={(e) =>
                  update({
                    intervalSeconds:
                      e.target.value === ""
                        ? ("" as unknown as number)
                        : Number(e.target.value),
                  })
                }
              />
            </SettingsField>
          </FieldGroup>
        </section>
        {calendar ? (
          <section
            className="connection-diagnostics"
            aria-label={t.checkConnection}
          >
            <ConnectionCheck
              key={`${calendar.id}:${calendar.version}`}
              connection={calendar}
              locale={locale}
              refresh={refresh}
            >
              <div className="connection-check-details">
                <p>{t.checkSavedHint}</p>
                <div className="connection-check-meta">
                  <span>
                    {t.lastSync}:{" "}
                    {calendar.lastSuccess === null
                      ? t.never
                      : relativeEventTime(
                          calendar.lastSuccess,
                          Date.now(),
                          locale,
                          timeZone,
                        )}
                  </span>
                  <span>
                    {t.eventCount}: {calendar.eventCount}
                  </span>
                </div>
              </div>
            </ConnectionCheck>
          </section>
        ) : null}
        <div className="form-actions">
          <Button disabled={status === "saving"}>
            {status === "saving" ? t.saving : t.save}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/settings/connections">{t.cancel}</Link>
          </Button>
          {calendar ? (
            <>
              <DeleteButton
                locale={locale}
                description={t.confirmCalendarDelete}
                disabled={status === "saving"}
                onConfirm={async () => {
                  try {
                    await mutate({
                      action: "calendar-delete",
                      id: calendar.id,
                    });
                    await refresh();
                    router.push("/settings/connections");
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : "error");
                  }
                }}
              />
            </>
          ) : null}
        </div>
        <p role="status" className="form-feedback">
          {status === "saved"
            ? t.saved
            : status === "queued"
              ? t.syncQueued
              : status && status !== "saving"
                ? errorText(status, locale)
                : ""}
        </p>
      </form>
    </>
  );
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import type { CalendarConfig, CalendarConnection } from "@peek/core/calendars";
import { relativeEventTime } from "@peek/core/time";
import { mutate, errorText } from "./api";
export function syncError(code: string, locale: Locale) {
  const t = messages(locale);
  return code === "blocked-address"
    ? t.blockedAddress
    : code === "invalid-calendar"
      ? t.invalidFeed
      : code === "encryption-key"
        ? t.keyError
        : t.syncError;
}
export function CalendarEditor({
  calendar,
  locale,
  refresh,
}: {
  calendar?: CalendarConnection;
  locale: Locale;
  refresh: () => Promise<void>;
}) {
  const t = messages(locale),
    router = useRouter();
  const [config, setConfig] = useState<CalendarConfig>(
    calendar ?? {
      name: "",
      owner: { name: "", color: "blue" },
      timeZone: "Europe/Moscow",
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
      <Link className="back-link" href="/settings/calendars">
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
            if (!calendar) router.replace(`/settings/calendars/${result.id}`);
          } catch (e) {
            setStatus(e instanceof Error ? e.message : "error");
          }
        }}
      >
        <section className="form-section">
          <h2>{t.calendarBasics}</h2>
          <div className="form-grid">
            <label className="span-two">
              {t.calendarName}
              <input
                required
                maxLength={100}
                value={config.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label className="span-two">
              {t.calendarUrl}
              <input
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
            </label>
            <label>
              {t.ownerName}
              <input
                required
                maxLength={100}
                value={config.owner.name}
                onChange={(e) =>
                  update({ owner: { ...config.owner, name: e.target.value } })
                }
              />
            </label>
            <label>
              {t.ownerColor}
              <select
                value={config.owner.color}
                onChange={(e) =>
                  update({
                    owner: {
                      ...config.owner,
                      color: e.target.value as CalendarConfig["owner"]["color"],
                    },
                  })
                }
              >
                {(["blue", "pink", "green"] as const).map((color) => (
                  <option key={color} value={color}>
                    {t[color]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="form-section">
          <h2>{t.calendarSchedule}</h2>
          <div className="form-grid">
            <label>
              {t.timeZone}
              <input
                required
                list="timezones"
                value={config.timeZone}
                onChange={(e) => update({ timeZone: e.target.value })}
              />
              <datalist id="timezones">
                {[
                  "Europe/Moscow",
                  "UTC",
                  "Europe/London",
                  "Europe/Berlin",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Asia/Tokyo",
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </label>
            <label>
              {t.intervalSeconds}
              <input
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
            </label>
          </div>
        </section>
        {calendar ? (
          <div className="execution-note">
            <span>
              {t.lastSync}:{" "}
              {calendar.lastSuccess === null
                ? t.never
                : relativeEventTime(calendar.lastSuccess, Date.now(), locale)}
            </span>
            <span>
              {t.eventCount}: {calendar.eventCount}
            </span>
            {calendar.error ? (
              <span className="form-error">
                {syncError(calendar.error, locale)}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="form-actions">
          <button disabled={status === "saving"}>
            {status === "saving" ? t.saving : t.save}
          </button>
          <Link href="/settings/calendars">{t.cancel}</Link>
          {calendar ? (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={async () => {
                  try {
                    await mutate({ action: "calendar-sync", id: calendar.id });
                    setStatus("queued");
                    await refresh();
                  } catch {
                    setStatus("error");
                  }
                }}
              >
                {t.syncNow}
              </button>
              <button
                type="button"
                className="quiet-button danger"
                onClick={async () => {
                  if (!confirm(t.confirmCalendarDelete)) return;
                  try {
                    await mutate({
                      action: "calendar-delete",
                      id: calendar.id,
                    });
                    await refresh();
                    router.push("/settings/calendars");
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : "error");
                  }
                }}
              >
                {t.remove}
              </button>
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

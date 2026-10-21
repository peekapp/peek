import { messages, type Locale } from "@peek/core/i18n";
export async function mutate(body: unknown): Promise<{ id?: string }> {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "error");
  return data;
}
export function errorText(code: string, locale: Locale) {
  const t = messages(locale);
  return code === "invalid"
    ? t.invalid
    : code === "invalid-calendar"
      ? t.invalidCalendar
      : code === "invalid-url"
        ? t.invalidUrl
        : code === "calendar-in-use"
          ? t.calendarInUse
          : code === "encryption-key"
            ? t.keyError
            : t.error;
}

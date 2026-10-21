import { messages, type Locale } from "@peek/core/i18n";
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

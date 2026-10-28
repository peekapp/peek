import { messages, type Locale } from "@peek/core/i18n";
export function resourceCountLabel(count: number, locale: Locale, kind: "card" | "scenario") {
  const t = messages(locale);
  const plural = new Intl.PluralRules(locale).select(count);
  const suffix = plural === "one" ? "One" : plural === "few" ? "Few" : plural === "many" ? "Many" : "Other";
  const template = t[`${kind}Count${suffix}`];
  return template.replace("{count}", count.toLocaleString(locale));
}

import { messages, type Locale } from "@peek/core/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function ScenarioCardCount({ count, locale }: { count: number; locale: Locale }) {
  return <ResourceCount count={count} locale={locale} kind="card" />;
}

export function ConnectionScenarioCount({ count, locale }: { count: number; locale: Locale }) {
  return <ResourceCount count={count} locale={locale} kind="scenario" />;
}

function ResourceCount({ count, locale, kind }: { count: number; locale: Locale; kind: "card" | "scenario" }) {
  const t = messages(locale);
  const plural = new Intl.PluralRules(locale).select(count);
  const suffix = plural === "one" ? "One" : plural === "few" ? "Few" : plural === "many" ? "Many" : "Other";
  const template = t[`${kind}Count${suffix}`];
  const label = template.replace("{count}", count.toLocaleString(locale));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="relative z-10 inline-flex whitespace-nowrap rounded-sm text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent size="compact">{kind === "card" ? t.scenarioCardCountHint : t.connectionScenarioCountHint}</TooltipContent>
    </Tooltip>
  );
}

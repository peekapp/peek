import { messages, type Locale } from "@peek/core/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function ScenarioCardCount({ count, locale }: { count: number; locale: Locale }) {
  const t = messages(locale);
  const plural = new Intl.PluralRules(locale).select(count);
  const template = plural === "one" ? t.cardCountOne : plural === "few" ? t.cardCountFew : plural === "many" ? t.cardCountMany : t.cardCountOther;
  const label = template.replace("{count}", count.toLocaleString(locale));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="relative z-10 inline-flex rounded-sm text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent size="compact">{t.scenarioCardCountHint}</TooltipContent>
    </Tooltip>
  );
}

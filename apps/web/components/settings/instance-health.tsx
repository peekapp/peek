import { relativeUpdateTime } from "@peek/core/time";
import { cva } from "class-variance-authority";
import { messages, type Locale } from "@peek/core/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const dot = cva("size-2 shrink-0 rounded-full", {
  variants: {
    state: {
      error: "bg-status-error-foreground",
      paused: "bg-muted-foreground",
      waiting: "bg-warning-foreground",
      healthy: "bg-success-foreground",
    },
  },
});

export function InstanceHealth({
  enabled, error, lastSuccess, ready, locale, kind,
}: {
  kind: "scenario" | "connection";
  enabled: boolean;
  error: string | null;
  lastSuccess: number | null;
  ready: boolean;
  locale: Locale;
}) {
  const t = messages(locale);
  const paused = kind === "scenario" && (!enabled || (!error && !ready));
  const state = paused ? "paused" : error ? "error" : lastSuccess === null ? "waiting" : "healthy";
  const label = {
    error: t.needsAttention,
    paused: t.paused,
    waiting: t.pending,
    healthy: kind === "connection" ? t.connected : t.healthy,
  }[state];
  const detail = kind === "scenario" && !enabled
    ? t.scenarioPaused
    : error || (!ready ? t.extensionRunnerUnavailable : lastSuccess === null
      ? (kind === "connection" ? t.pending : t.scenarioWaiting)
      : null);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`${t.health}: ${label}`} className="relative z-10 inline-flex items-center gap-2 rounded-sm text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span aria-hidden="true" className={dot({ state })} />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent size="compact" className="max-w-64">
        {detail ? <p>{detail}</p> : null}
        {lastSuccess !== null ? (
          <>
            <p>{kind === "connection" ? t.lastUpdated : t.lastSuccessfulRun}: {relativeUpdateTime(lastSuccess, Date.now(), locale)}</p>
            <time dateTime={new Date(lastSuccess).toISOString()}>
              {new Date(lastSuccess).toLocaleString(locale, {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit", hourCycle: "h23",
              })}
            </time>
          </>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

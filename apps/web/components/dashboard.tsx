"use client";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "./ui/alert";
import { Empty, EmptyHeader, EmptyTitle } from "./ui/empty";
import { resolveTheme } from "@peek/core/themes";
import { Brand } from "./brand";

import { useEffect, useRef, useState } from "react";
import {
  activeCards,
  countdown,
  priorityAt,
  type Owner as CardOwner,
} from "@peek/core";

import { workerHealthy, type ScreenHeartbeat, type ScreenState } from "@peek/core/state";

import { ProfileIdentity } from "./profile-label";
import Link from "next/link";
import { messages } from "@peek/core/i18n";
import { relativeEventTime, formatTime } from "@peek/core/time";

const feedVariants = cva("grid flex-1 gap-3 md:gap-7 xl:gap-12", {
  variants: {
    single: {
      true: "grid-cols-1",
      false: "md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]",
    },
  },
});
const timerVariants = cva(
  "font-light leading-none tracking-tighter tabular-nums text-timer",
  {
    variants: {
      text: {
        true: "text-display-status wrap-anywhere",
        false: "text-display-timer md:text-display-timer-wide",
      },
    },
  },
);
function Owner({
  owner,
  sharedLabel,
}: {
  owner: CardOwner;
  sharedLabel: string;
}) {
  return (
    <ProfileIdentity
      profileId={owner.profileId}
      name={owner.system ? sharedLabel : owner.name}
      color={owner.color}
    />
  );
}

export function Dashboard({
  initialState,
  screenId,
  storageUnavailable = false,
}: {
  initialState: ScreenState;
  screenId?: string;
  storageUnavailable?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialState);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "offline" | "storage"
  >(storageUnavailable ? "storage" : "connecting");
  const [now, setNow] = useState(initialState.serverTime);
  const offset = useRef(0);
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    const stream = new EventSource(
      screenId
        ? `/api/screens/${encodeURIComponent(screenId)}/events`
        : "/api/screen/events",
    );
    let lastMessage = Date.now();
    const received = (incoming: ScreenHeartbeat) => {
      lastMessage = Date.now();
      offset.current = incoming.serverTime - lastMessage;
      setNow(incoming.serverTime);
      setConnection(navigator.onLine ? "connected" : "offline");
    };
    stream.onmessage = (event) => {
      const incoming = JSON.parse(event.data) as ScreenState;
      received(incoming);
      // Restored databases may have lower revisions; SSE frames arrive in order.
      setSnapshot(incoming);
    };
    stream.addEventListener("heartbeat", (event) => {
      const incoming = JSON.parse(event.data) as ScreenHeartbeat;
      received(incoming);
      setSnapshot((current) => ({
        ...current,
        serverTime: incoming.serverTime,
        heartbeat: incoming.heartbeat,
      }));
    });
    const unavailable = () => {
      lastMessage = Date.now();
      setConnection("storage");
    };
    stream.addEventListener("unavailable", unavailable);
    stream.addEventListener("removed", () => {
      setRemoved(true);
      setSnapshot((current) => ({ ...current, cards: [] }));
      stream.close();
    });
    stream.onerror = () => setConnection("offline");
    const update = () => {
      setNow(Date.now() + offset.current);
      if (!navigator.onLine || Date.now() - lastMessage > 10_000)
        setConnection("offline");
    };
    update();
    const interval = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("offline", update);
    window.addEventListener("online", update);
    return () => {
      stream.close();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("online", update);
    };
  }, [screenId]);
  const locale = snapshot.locale ?? "en";
  const t = messages(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const cards = snapshot.cards;
  const screen = snapshot.screen;
  const timeZone =
    snapshot.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const warning = removed
    ? null
    : connection === "offline"
      ? t.offline
      : connection === "storage"
        ? t.storage
        : connection === "connected" && !workerHealthy(snapshot.heartbeat, now)
          ? t.worker
          : snapshot.connectionErrors
            ? t.connectionWarning
            : snapshot.scenarioErrors
              ? t.scenarioWarning
              : null;

  const [primary, ...secondary] = activeCards(cards, now);
  const timer = primary ? countdown(primary, now, locale) : null;

  return (
    <main
      className="flex min-h-svh flex-col bg-background px-4 text-foreground md:px-6 xl:px-10 2xl:px-16"
      data-theme={resolveTheme(screen?.theme, snapshot.theme)}
      style={{
        zoom: screen?.scale ?? 1,
        minHeight: `${100 / (screen?.scale ?? 1)}svh`,
      }}
    >
      <header className="flex h-20 shrink-0 items-center justify-between md:h-24 2xl:h-30">
        <div className="mr-6 flex min-w-0 items-center gap-5">
          <Brand />
          {screen ? (
            <small
              className="max-w-28 truncate border-l border-border pl-5 text-xs text-muted-foreground md:max-w-56"
              title={screen.name}
            >
              {screen.name}
            </small>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-4 md:gap-6">
          <span className="hidden text-xs text-muted-foreground md:inline">
            {formatTime(now, locale, timeZone).date}
          </span>
          <strong className="text-2xl font-normal tabular-nums">
            {formatTime(now, locale, timeZone).clock}
          </strong>
        </div>
      </header>
      {warning ? (
        <Alert variant="warning" role="status">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}
      {primary && timer ? (
        <section
          className={cn(feedVariants({ single: secondary.length === 0 }))}
          aria-label={t.currentEvents}
        >
          <article
            className="flex min-h-115 min-w-0 flex-col rounded-3xl bg-secondary p-6 md:min-h-140 md:p-7 xl:p-9 2xl:min-h-162 2xl:p-12"
            key={primary.id}
          >
            <div className="flex items-center justify-between gap-4 text-xs">
              <Owner owner={primary.owner} sharedLabel={t.sharedProfile} />
              <time
                className="text-xs text-muted-foreground"
                dateTime={new Date(primary.targetAt).toISOString()}
              >
                {relativeEventTime(primary.targetAt, now, locale, timeZone)}
              </time>
            </div>
            {primary.kind !== "info" ? (
              <div className="my-auto">
                <span className="mt-7 mb-2 block text-sm text-muted-foreground">
                  {timer.label}
                </span>
                <strong
                  className={cn(
                    timerVariants({
                      text:
                        primary.kind === "deadline" || now >= primary.targetAt,
                    }),
                  )}
                >
                  {timer.value}
                </strong>
              </div>
            ) : null}
            <div className="md:pt-6">
              <h1 className="mt-6 mb-4 max-w-96 text-4xl leading-tight font-medium tracking-tighter wrap-anywhere md:text-display-title">
                {primary.title}
              </h1>
              {primary.body ? <p>{primary.body}</p> : null}
              {primary.location ? (
                <span className="text-xs text-muted-foreground">
                  {primary.location}
                </span>
              ) : null}
            </div>
          </article>
          {secondary.length > 0 ? (
            <div className="flex min-w-0 flex-col px-1">
              {secondary.map((card) => (
                <article
                  className="group/event min-w-0 flex-1 border-b border-border px-1 py-6 last:border-0 md:px-0 md:py-8"
                  data-urgent={priorityAt(card, now) > card.priority}
                  key={card.id}
                >
                  <div className="flex items-center justify-between gap-4 text-xs md:flex-col md:items-start xl:flex-row xl:items-center">
                    <Owner owner={card.owner} sharedLabel={t.sharedProfile} />
                    <time
                      className="text-xs text-muted-foreground group-data-[urgent=true]/event:text-due"
                      dateTime={new Date(card.targetAt).toISOString()}
                    >
                      {relativeEventTime(card.targetAt, now, locale, timeZone)}
                    </time>
                  </div>
                  <h2 className="mt-5 mb-2 text-2xl leading-tight font-medium tracking-tight wrap-anywhere md:mt-6 md:mb-4 2xl:text-3xl">
                    {card.title}
                  </h2>
                  {card.body ? <p>{card.body}</p> : null}
                  <span className="text-sm text-due">
                    {countdown(card, now, locale).value}
                  </span>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <Empty variant="screen">
          <EmptyHeader>
            <EmptyTitle asChild>
              <h1>
                {removed
                  ? t.screenRemoved
                  : connection === "storage" || connection === "offline"
                    ? t.waitingUpdates
                    : t.allClear}
              </h1>
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      <footer className="flex h-12 shrink-0 items-center justify-between text-xs text-muted-foreground">
        <Link className="py-2.5" href="/settings">
          {t.settings}
        </Link>
      </footer>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  activeCards,
  countdown,
  priorityAt,
  type Owner as CardOwner,
} from "@peek/core";

import { workerHealthy, type ScreenState } from "@peek/core/state";

import Link from "next/link";
import { messages } from "@peek/core/i18n";
import { relativeEventTime, formatTime } from "@peek/core/time";

function Owner({
  owner,
  sharedLabel,
}: {
  owner: CardOwner;
  sharedLabel: string;
}) {
  return (
    <span className={`owner owner--${owner.color}`}>
      <i aria-hidden="true" />
      {owner.system ? sharedLabel : owner.name}
    </span>
  );
}

export function Dashboard({
  initialState,
  storageUnavailable = false,
}: {
  initialState: ScreenState;
  storageUnavailable?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialState);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "offline" | "storage"
  >(storageUnavailable ? "storage" : "connecting");
  const [now, setNow] = useState(initialState.serverTime);
  const offset = useRef(0);
  useEffect(() => {
    const stream = new EventSource("/api/screen/events");
    let lastMessage = Date.now();
    stream.onmessage = (event) => {
      const incoming = JSON.parse(event.data) as ScreenState;
      lastMessage = Date.now();
      offset.current = incoming.serverTime - Date.now();
      setSnapshot((current) =>
        incoming.revision >= current.revision ? incoming : current,
      );
      setConnection(navigator.onLine ? "connected" : "offline");
    };
    const unavailable = () => {
      lastMessage = Date.now();
      setConnection("storage");
    };
    stream.addEventListener("unavailable", unavailable);
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
  }, []);
  const locale = snapshot.locale ?? "en";
  const t = messages(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const cards = snapshot.cards;
  const warning =
    connection === "offline"
      ? t.offline
      : connection === "storage"
        ? t.storage
        : connection === "connected" && !workerHealthy(snapshot.heartbeat, now)
          ? t.worker
          : snapshot.calendarErrors
            ? t.calendarWarning
            : snapshot.scenarioErrors
              ? t.scenarioWarning
              : null;

  const [primary, ...secondary] = activeCards(cards, now);
  const timer = primary ? countdown(primary, now, locale) : null;

  return (
    <main className="dashboard">
      <header className="screen-header">
        <div className="brand">
          <img src="/peek-mark.svg" alt="" width={28} height={33} />
          <span>peek</span>
        </div>
        <div className="clock">
          <span>{formatTime(now, locale).date}</span>
          <strong>{formatTime(now, locale).clock}</strong>
        </div>
      </header>
      {warning ? (
        <div className="system-warning" role="status">
          {warning}
        </div>
      ) : null}
      {primary && timer ? (
        <section
          className={`feed${secondary.length === 0 ? " feed--single" : ""}`}
          aria-label={t.currentEvents}
        >
          <article className="hero" key={primary.id}>
            <div className="hero-meta">
              <Owner owner={primary.owner} sharedLabel={t.sharedProfile} />
              <time
                className="meeting-time"
                dateTime={new Date(primary.targetAt).toISOString()}
              >
                {relativeEventTime(primary.targetAt, now, locale)}
              </time>
            </div>
            <div
              className={`timer${primary.kind === "deadline" || now >= primary.targetAt ? " timer--text" : ""}`}
            >
              <span>{timer.label}</span>
              <strong>{timer.value}</strong>
            </div>
            <div className="hero-title">
              <h1>{primary.title}</h1>
              {primary.location ? (
                <span className="source">{primary.location}</span>
              ) : null}
            </div>
          </article>
          {secondary.length > 0 ? (
            <div className="secondary">
              {secondary.map((card) => (
                <article
                  className={`event${priorityAt(card, now) > card.priority ? " event--today" : ""}`}
                  key={card.id}
                >
                  <div className="event-meta">
                    <Owner owner={card.owner} sharedLabel={t.sharedProfile} />
                    <time
                      className="due"
                      dateTime={new Date(card.targetAt).toISOString()}
                    >
                      {relativeEventTime(card.targetAt, now, locale)}
                    </time>
                  </div>
                  <h2>{card.title}</h2>
                  <span className="remaining">
                    {countdown(card, now, locale).value}
                  </span>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="empty-state">
          <h1>
            {connection === "storage" || connection === "offline"
              ? t.waitingUpdates
              : t.allClear}
          </h1>
        </section>
      )}
      <footer className="screen-footer">
        <Link href="/settings">{t.settings}</Link>
        <span>{t.footer}</span>
      </footer>
    </main>
  );
}

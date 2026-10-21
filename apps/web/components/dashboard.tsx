"use client";

import { useEffect, useState } from "react";
import {
  activeCards,
  countdown,
  priorityAt,
  type Card,
  type Owner as CardOwner,
} from "../lib/cards";

const timeZone = "Europe/Moscow";
const clockFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone,
  weekday: "short",
  day: "numeric",
  month: "long",
});
const eventFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function Owner({ owner }: { owner: CardOwner }) {
  return (
    <span className={`owner owner--${owner.color}`}>
      <i aria-hidden="true" />
      {owner.name}
    </span>
  );
}

export function Dashboard({
  cards,
  initialNow,
}: {
  cards: Card[];
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    // Read the clock rather than subtracting ticks: background tabs can pause timers.
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  const [primary, ...secondary] = activeCards(cards, now);
  const timer = primary ? countdown(primary, now) : null;

  return (
    <main className="dashboard">
      <header className="screen-header">
        <div className="brand">
          <img src="/peek-mark.svg" alt="" width={28} height={33} />
          <span>peek</span>
        </div>
        <div className="clock">
          <span>{dateFormat.format(now).toLowerCase()}</span>
          <strong>{clockFormat.format(now)}</strong>
        </div>
      </header>
      {primary && timer ? (
        <section
          className={`feed${secondary.length === 0 ? " feed--single" : ""}`}
          aria-label="Актуальные события"
        >
          <article className="hero" key={primary.id}>
            <div className="hero-meta">
              <Owner owner={primary.owner} />
              <time
                className="meeting-time"
                dateTime={new Date(primary.targetAt).toISOString()}
              >
                {eventFormat.format(primary.targetAt)}
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
                    <Owner owner={card.owner} />
                    <time
                      className="due"
                      dateTime={new Date(card.targetAt).toISOString()}
                    >
                      {eventFormat.format(card.targetAt)}
                    </time>
                  </div>
                  <h2>{card.title}</h2>
                  <span className="remaining">
                    {countdown(card, now).value}
                  </span>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="empty-state">
          <h1>Всё спокойно</h1>
        </section>
      )}
      <footer className="screen-footer">Демо-события · Москва</footer>
    </main>
  );
}

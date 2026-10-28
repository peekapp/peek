"use client";

import { useEffect, useState } from "react";
import type { Card } from "@peek/core";
import { messages, type Locale } from "@peek/core/i18n";
import { Button } from "../ui/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "../ui/item";
import { ErrorState, LoadingState, SettingsEmpty, SettingsList } from "./layout";

export function ScenarioCards({ scenarioId, open, locale }: { scenarioId: string; open: boolean; locale: Locale }) {
  const t = messages(locale);
  const [data, setData] = useState<{ cards: Card[]; timeZone: string } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setData(null);
    setError(false);
    void fetch(`/api/scenarios/${encodeURIComponent(scenarioId)}/cards`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("cards-unavailable");
        const result = await response.json();
        if (!controller.signal.aborted) setData(result);
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [scenarioId, open, attempt]);
  if (error) return <><ErrorState>{t.scenarioCardsError}</ErrorState><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t.retry}</Button></>;
  if (!data) return <LoadingState layout="list">{t.scenarioCardsLoading}</LoadingState>;
  if (!data.cards.length) return <SettingsEmpty title={t.scenarioCardsEmpty} />;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: data.timeZone });
  return <SettingsList>{data.cards.map((card) => <Item key={card.id} role="listitem" variant="resource">
    <ItemContent>
      <ItemTitle>{card.title}</ItemTitle>
      {card.body ? <ItemDescription className="line-clamp-none whitespace-pre-wrap wrap-anywhere">{card.body}</ItemDescription> : null}
      {card.location ? <ItemDescription className="line-clamp-none wrap-anywhere">{card.location}</ItemDescription> : null}
      <ItemDescription className="line-clamp-none wrap-anywhere">{t.scenarioCardTarget}: {date.format(card.targetAt)}</ItemDescription>
      <ItemDescription className="line-clamp-none wrap-anywhere">{t.scenarioCardVisibility}: {date.format(card.visibleFrom)} – {date.format(card.expiresAt)} ({data.timeZone})</ItemDescription>
    </ItemContent>
  </Item>)}</SettingsList>;
}

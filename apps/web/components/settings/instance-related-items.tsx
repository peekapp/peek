"use client";

import type { ReactNode } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import { RelatedItems, type RelatedItemsVariant } from "./related-items";
import { resourceCountLabel } from "./card-count";
import { ScenarioCards } from "./scenario-cards";

export function InstanceRelatedItems({ id, kind, count, locale, variant, children }: {
  id: string;
  kind: "scenario" | "connection";
  count: number;
  locale: Locale;
  variant?: RelatedItemsVariant;
  children?: ReactNode;
}) {
  const t = messages(locale);
  const label = resourceCountLabel(count, locale, kind === "scenario" ? "card" : "scenario");
  return <RelatedItems locale={locale} variant={variant}
    description={kind === "scenario" ? t.scenarioRelatedDescription : t.connectionRelatedDescription}
    counts={[{ label, value: label, hint: kind === "scenario" ? t.scenarioCardCountHint : t.connectionScenarioCountHint }]}>
    {(open) => kind === "scenario" ? <ScenarioCards scenarioId={id} open={open} locale={locale} /> : children}
  </RelatedItems>;
}

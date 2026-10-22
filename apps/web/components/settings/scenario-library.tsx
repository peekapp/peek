"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Flag,
  Library,
  Download,
  Users,
  Star,
  ChevronRight,
} from "lucide-react";
import { messages, type Locale } from "@peek/core/i18n";
import type { Status } from "./extensions";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "../ui/empty";

type Definition = { id: string; title: string; description: string };
const icons: Record<string, typeof CalendarClock> = {
  "peek/meetings": CalendarClock,
  "peek/deadlines": Flag,
};
const favoritesKey = "peek:scenario-favorites:v2";

export function ScenarioLibrary({
  locale,
  onSelect,
  packages,
}: {
  locale: Locale;
  packages: Status["packages"];
  onSelect: () => void;
}) {
  const t = messages(locale);
  const describe = ({
    manifest: m,
  }: Status["packages"][number]): Definition => ({
    id: m.id,
    title:
      m.id === "peek/meetings"
        ? t.meetings
        : m.id === "peek/deadlines"
          ? t.deadlines
          : m.name,
    description:
      m.id === "peek/meetings"
        ? t.meetingsDescription
        : m.id === "peek/deadlines"
          ? t.deadlinesDescription
          : m.description,
  });
  const scenarioDefinitions = packages
    .filter((p) => p.official && p.manifest.kind === "scenario")
    .map(describe);
  const downloaded = packages
    .filter((p) => !p.official && p.manifest.kind === "scenario")
    .map(describe);
  const [tab, setTab] = useState("builtin");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(favoritesKey) ?? "[]",
      );
      if (Array.isArray(saved))
        setFavorites(
          saved.filter((id): id is string => typeof id === "string"),
        );
    } catch {
      /* An unavailable or old cache should not block the catalog. */
    }
  }, []);

  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((value) => value !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem(favoritesKey, JSON.stringify(next));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }

  function renderScenario(definition: Definition) {
    const Icon = icons[definition.id] ?? Library;
    const favorite = favorites.includes(definition.id);
    return (
      <div className="scenario-library-item" key={definition.id}>
        <Link
          className="scenario-library-link"
          href={`/settings/scenarios/new?package=${encodeURIComponent(definition.id)}`}
          onClick={onSelect}
        >
          <span className="scenario-library-icon">
            <Icon aria-hidden="true" />
          </span>
          <span className="scenario-library-copy">
            <strong className="flex flex-wrap items-center gap-2">
              {definition.title}
            </strong>
            <span>{definition.description}</span>
          </span>
          <ChevronRight className="scenario-library-arrow" aria-hidden="true" />
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="scenario-library-favorite"
          aria-pressed={favorite}
          aria-label={`${favorite ? t.removeScenarioFavorite : t.addScenarioFavorite}: ${definition.title}`}
          title={favorite ? t.removeScenarioFavorite : t.addScenarioFavorite}
          onClick={() => toggleFavorite(definition.id)}
        >
          <Star fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className="scenario-library-intro">{t.scenarioLibraryHint}</p>
      <Tabs
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="scenario-library"
      >
        <TabsList
          className="scenario-library-nav"
          aria-label={t.scenarioLibrary}
        >
          <TabsTrigger value="builtin">
            <Library aria-hidden="true" />
            {t.builtinScenarios}
          </TabsTrigger>
          <TabsTrigger value="downloaded">
            <Download aria-hidden="true" />
            {t.downloadedScenarios}
          </TabsTrigger>
          <TabsTrigger value="community">
            <Users aria-hidden="true" />
            {t.communityScenarios}
            <Badge variant="secondary">{t.comingSoon}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="builtin" className="scenario-library-content">
          <section
            className="scenario-library-section"
            aria-labelledby="scenario-favorites-heading"
          >
            <h3 id="scenario-favorites-heading">
              <Star aria-hidden="true" />
              {t.favoriteScenarios}
            </h3>
            {scenarioDefinitions.some((d) => favorites.includes(d.id)) ? (
              scenarioDefinitions
                .filter((d) => favorites.includes(d.id))
                .map(renderScenario)
            ) : (
              <p className="scenario-library-favorites-hint">
                {t.favoriteScenariosHint}
              </p>
            )}
            {saveError ? <p role="status">{t.favoritesSaveError}</p> : null}
          </section>
          <section
            className="scenario-library-section"
            aria-labelledby="scenario-starter-heading"
          >
            <h3 id="scenario-starter-heading">{t.starterScenarios}</h3>
            <p className="scenario-library-section-hint">
              {t.starterScenariosHint}
            </p>
            {scenarioDefinitions.map(renderScenario)}
          </section>
          <section
            className="scenario-library-section"
            aria-labelledby="scenario-categories-heading"
          >
            <h3 id="scenario-categories-heading">{t.scenarioCategories}</h3>
            <details className="scenario-library-category">
              <summary>
                <CalendarClock aria-hidden="true" />
                <span>{t.scenarioCategoryCalendar}</span>
                <Badge variant="secondary">{scenarioDefinitions.length}</Badge>
                <ChevronRight aria-hidden="true" />
              </summary>
              {scenarioDefinitions.map(renderScenario)}
            </details>
          </section>
        </TabsContent>
        <TabsContent
          value="downloaded"
          className="scenario-library-content scenario-library-empty"
        >
          {downloaded.length ? (
            downloaded.map(renderScenario)
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Download aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t.noDownloadedScenarios}</EmptyTitle>
                <EmptyDescription>{t.downloadedScenariosHint}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => setTab("builtin")}>
                {t.browseBuiltinScenarios}
              </Button>
            </Empty>
          )}
        </TabsContent>
        <TabsContent
          value="community"
          className="scenario-library-content scenario-library-empty"
        >
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users aria-hidden="true" />
              </EmptyMedia>
              <Badge variant="secondary">{t.comingSoon}</Badge>
              <EmptyTitle>{t.communityScenariosTitle}</EmptyTitle>
              <EmptyDescription>{t.communityScenariosHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </TabsContent>
      </Tabs>
    </>
  );
}

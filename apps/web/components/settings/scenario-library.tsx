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
import { ScenarioIntegrations } from "./scenario-integrations";
import {
  integrationDefinitions,
  scenarioDefinitions,
} from "@peek/core/registry";
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

type Definition = (typeof scenarioDefinitions)[number];
const icons = { meetings: CalendarClock, deadlines: Flag };
const favoritesKey = "peek:scenario-favorites:v1";

export function ScenarioLibrary({
  locale,
  onSelect,
}: {
  locale: Locale;
  onSelect: () => void;
}) {
  const t = messages(locale);
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
          saved.filter(
            (id): id is string =>
              typeof id === "string" &&
              scenarioDefinitions.some((d) => d.id === id),
          ),
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
    const Icon = icons[definition.id];
    const favorite = favorites.includes(definition.id);
    return (
      <div className="scenario-library-item" key={definition.id}>
        <Link
          className="scenario-library-link"
          href={`/settings/scenarios/new-${definition.id}`}
          onClick={onSelect}
        >
          <span className="scenario-library-icon">
            <Icon aria-hidden="true" />
          </span>
          <span className="scenario-library-copy">
            <strong className="flex flex-wrap items-center gap-2">
              {t[definition.nameKey]}
              <ScenarioIntegrations
                integrationIds={integrationDefinitions
                  .filter((integration) =>
                    definition.requires.every((capability) =>
                      integration.capabilities.some(
                        (supported) => supported === capability,
                      ),
                    ),
                  )
                  .map((integration) => integration.id)}
              />
            </strong>
            <span>{t[definition.descriptionKey]}</span>
          </span>
          <ChevronRight className="scenario-library-arrow" aria-hidden="true" />
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="scenario-library-favorite"
          aria-pressed={favorite}
          aria-label={`${favorite ? t.removeScenarioFavorite : t.addScenarioFavorite}: ${t[definition.nameKey]}`}
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
            {favorites.length ? (
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

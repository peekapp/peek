"use client";

import { ExtensionIcon } from "../extension-icon";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
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

const catalogPanelVariants = cva(
  "overflow-y-auto p-4 sm:px-7 sm:py-6 h-[min(460px,55dvh)] sm:h-[min(510px,65dvh)] [scrollbar-gutter:stable]",
  {
    variants: {
      empty: {
        true: "data-[state=active]:flex data-[state=active]:items-center",
        false: "",
      },
    },
  },
);
function CatalogPanel({
  empty = false,
  className,
  ...props
}: React.ComponentProps<typeof TabsContent> & { empty?: boolean }) {
  return (
    <TabsContent
      className={cn(catalogPanelVariants({ empty }), className)}
      {...props}
    />
  );
}
function CatalogSection({
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className="mb-7 last:mb-0" {...props}>
      {children}
    </section>
  );
}
function CatalogHeading(props: React.ComponentProps<"h3">) {
  return (
    <h3
      className="mb-3 flex items-center gap-2 text-sm font-semibold [&>svg]:size-4 [&>svg]:text-muted-foreground"
      {...props}
    />
  );
}
type Definition = {
  id: string;
  title: string;
  description: string;
  iconDataUrl: string | null;
  iconColor: Status["packages"][number]["manifest"]["iconColor"];
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
    iconDataUrl,
  }: Status["packages"][number]): Definition => ({
    id: m.id,
    iconColor: m.iconColor,
    iconDataUrl,
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
    const favorite = favorites.includes(definition.id);
    return (
      <div
        className="mt-2 flex items-center gap-1 rounded-md border border-border pr-2.5 hover:border-ring hover:bg-card"
        key={definition.id}
      >
        <Link
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-4 pr-2 pl-3 text-foreground sm:pl-4"
          href={`/scenarios/new?package=${encodeURIComponent(definition.id)}`}
          onClick={onSelect}
        >
          <ExtensionIcon kind="scenario" src={definition.iconDataUrl} color={definition.iconColor} />
          <span className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
            <strong className="flex flex-wrap items-center gap-2">
              {definition.title}
            </strong>
            <span className="text-sm leading-relaxed text-muted-foreground">
              {definition.description}
            </span>
          </span>
          <ChevronRight
            className="hidden size-4 shrink-0 text-muted-foreground sm:block"
            aria-hidden="true"
          />
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="aria-pressed:text-primary"
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
      <p className="mx-5 mt-2.5 mb-5 pr-3 text-sm text-muted-foreground sm:mx-7 sm:mb-6">
        {t.scenarioLibraryHint}
      </p>
      <Tabs
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="grid grid-cols-1 gap-0 border-t border-border sm:grid-cols-[14rem_minmax(0,1fr)]"
      >
        <TabsList variant="catalog" aria-label={t.scenarioLibrary}>
          <TabsTrigger variant="catalog" value="builtin">
            <Library aria-hidden="true" />
            {t.builtinScenarios}
          </TabsTrigger>
          <TabsTrigger variant="catalog" value="downloaded">
            <Download aria-hidden="true" />
            {t.downloadedScenarios}
          </TabsTrigger>
          <TabsTrigger variant="catalog" value="community">
            <Users aria-hidden="true" />
            {t.communityScenarios}
            <Badge variant="secondary">{t.comingSoon}</Badge>
          </TabsTrigger>
        </TabsList>
        <CatalogPanel value="builtin">
          <CatalogSection aria-labelledby="scenario-favorites-heading">
            <CatalogHeading id="scenario-favorites-heading">
              <Star aria-hidden="true" />
              {t.favoriteScenarios}
            </CatalogHeading>
            {scenarioDefinitions.some((d) => favorites.includes(d.id)) ? (
              scenarioDefinitions
                .filter((d) => favorites.includes(d.id))
                .map(renderScenario)
            ) : (
              <p className="mb-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                {t.favoriteScenariosHint}
              </p>
            )}
            {saveError ? <p role="status">{t.favoritesSaveError}</p> : null}
          </CatalogSection>
          <CatalogSection aria-labelledby="scenario-starter-heading">
            <CatalogHeading id="scenario-starter-heading">
              {t.starterScenarios}
            </CatalogHeading>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              {t.starterScenariosHint}
            </p>
            {scenarioDefinitions.map(renderScenario)}
          </CatalogSection>
          <CatalogSection aria-labelledby="scenario-categories-heading">
            <CatalogHeading id="scenario-categories-heading">
              {t.scenarioCategories}
            </CatalogHeading>
            <details className="group/category">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 py-3.5 text-sm [&::-webkit-details-marker]:hidden [&>svg]:size-4 [&>svg]:text-muted-foreground [&>svg:last-child]:group-open/category:rotate-90">
                <CalendarClock aria-hidden="true" />
                <span className="flex-1">{t.scenarioCategoryCalendar}</span>
                <Badge variant="secondary">{scenarioDefinitions.length}</Badge>
                <ChevronRight aria-hidden="true" />
              </summary>
              {scenarioDefinitions.map(renderScenario)}
            </details>
          </CatalogSection>
        </CatalogPanel>
        <CatalogPanel value="downloaded" empty={downloaded.length === 0}>
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
        </CatalogPanel>
        <CatalogPanel value="community" empty>
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
        </CatalogPanel>
      </Tabs>
    </>
  );
}

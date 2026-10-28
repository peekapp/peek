"use client";

import type { Manifest } from "@peekapp/sdk";
import { ExtensionIcon } from "../extension-icon";
import { Monitor, Plug, Workflow } from "lucide-react";
import type { Screen } from "@peek/core/screens";
import { messages, type Locale } from "@peek/core/i18n";
import { RelatedItems, RelatedItemsSection } from "./related-items";
import { SettingsEmpty, SettingsList, SettingsRow } from "./layout";

type ProfileResource = { id: string; name: string; profileId: string; iconDataUrl?: string | null; iconColor?: Manifest["iconColor"] };

export type ProfileUsageData = {
  screens: Screen[];
  scenarios: ProfileResource[];
  connections: ProfileResource[];
};

export function ProfileUsage({ profileId, data, locale, variant = "button" }: {
  profileId: string;
  variant?: "button" | "counts" | "menu";
  data: ProfileUsageData;
  locale: Locale;
}) {
  const t = messages(locale);
  const groups = [
    { label: t.screens, Icon: Monitor, path: "screens" as const, items: data.screens.filter((s) => s.allProfiles || s.profileIds.includes(profileId)) },
    { label: t.scenarios, Icon: Workflow, path: "scenarios" as const, items: data.scenarios.filter((s) => s.profileId === profileId) },
    { label: t.connections, Icon: Plug, path: "connections" as const, items: data.connections.filter((c) => c.profileId === profileId) },
  ];
  return <div className={variant === "counts" ? "mt-auto pt-3" : undefined}><RelatedItems locale={locale} variant={variant} description={t.profileUsageDescription}
    counts={groups.map(({ label, items, Icon }) => ({ label: `${label}: ${items.length}`, hint: label, value: items.length, Icon }))}>
        {groups.some((group) => group.items.length) ? groups.filter((group) => group.items.length).map((group) => <RelatedItemsSection key={group.path} label={group.label} count={group.items.length}>
          <SettingsList>
            {group.items.toSorted((a, b) => a.name.localeCompare(b.name, locale)).map((item) => <SettingsRow layout="compact" key={item.id}
              media={group.path === "screens" ? <Monitor className="size-5" aria-hidden="true" /> : <ExtensionIcon kind={group.path === "scenarios" ? "scenario" : "connection"} size="compact" src={"iconDataUrl" in item ? item.iconDataUrl : undefined} color={"iconColor" in item ? item.iconColor : undefined} />} title={item.name}
              href={`/${group.path}/${encodeURIComponent(item.id)}${group.path === "screens" ? "/edit" : ""}`} />)}
          </SettingsList>
        </RelatedItemsSection>) : <SettingsEmpty title={t.profileUnused} />}
  </RelatedItems></div>;
}

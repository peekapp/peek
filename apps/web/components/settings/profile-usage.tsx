"use client";

import { useRef } from "react";
import type { Manifest } from "@peekapp/sdk";
import { ExtensionIcon } from "../extension-icon";
import { DropdownMenuItem } from "../ui/dropdown-menu";
import { Monitor, Network, Plug, Workflow } from "lucide-react";
import type { Screen } from "@peek/core/screens";
import { messages, type Locale } from "@peek/core/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
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
  const opener = useRef<HTMLButtonElement>(null);
  const groups = [
    { label: t.screens, Icon: Monitor, path: "screens" as const, items: data.screens.filter((s) => s.allProfiles || s.profileIds.includes(profileId)) },
    { label: t.scenarios, Icon: Workflow, path: "scenarios" as const, items: data.scenarios.filter((s) => s.profileId === profileId) },
    { label: t.connections, Icon: Plug, path: "connections" as const, items: data.connections.filter((c) => c.profileId === profileId) },
  ];
  return <Sheet>
    {variant === "counts" ? <div className="relative z-10 mt-auto flex justify-center gap-4 pt-3 text-sm tabular-nums text-muted-foreground">
      {groups.map(({ label, items, Icon }) => <Tooltip key={label}>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="content" onClick={(event) => { opener.current = event.currentTarget; }} aria-label={`${label}: ${items.length}`}>
              <Icon aria-hidden="true" />{items.length}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>)}
    </div> : variant === "menu" ? <SheetTrigger asChild>
      <DropdownMenuItem onSelect={(event) => event.preventDefault()}><Network aria-hidden="true" />{t.profileRelatedItems}</DropdownMenuItem>
    </SheetTrigger> : <SheetTrigger asChild>
      <Button type="button" variant="outline" size="sm"><Network aria-hidden="true" />{t.profileRelatedItems}</Button>
    </SheetTrigger>}
    <SheetContent locale={locale} variant="editor" onCloseAutoFocus={(event) => {
      if (opener.current) { event.preventDefault(); opener.current.focus(); }
    }}>
      <SheetHeader>
        <SheetTitle>{t.profileRelatedItems}</SheetTitle>
        <SheetDescription>{t.profileUsageDescription}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-4 pt-0">
        {groups.some((group) => group.items.length) ? groups.filter((group) => group.items.length).map((group) => <section key={group.path} aria-label={group.label} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{group.label} · {group.items.length}</h2>
          <SettingsList>
            {group.items.toSorted((a, b) => a.name.localeCompare(b.name, locale)).map((item) => <SettingsRow key={item.id}
              media={group.path === "screens" ? <Monitor className="size-5" aria-hidden="true" /> : <ExtensionIcon kind={group.path === "scenarios" ? "scenario" : "connection"} size="compact" src={"iconDataUrl" in item ? item.iconDataUrl : undefined} color={"iconColor" in item ? item.iconColor : undefined} />} title={item.name}
              href={`/${group.path}/${encodeURIComponent(item.id)}${group.path === "screens" ? "/edit" : ""}`} />)}
          </SettingsList>
        </section>) : <SettingsEmpty title={t.profileUnused} />}
      </div>
    </SheetContent>
  </Sheet>;
}

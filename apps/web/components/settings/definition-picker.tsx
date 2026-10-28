"use client";
import { ExtensionIcon } from "../extension-icon";
import { cn } from "@/lib/utils";
import type { Status } from "./extensions";
import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import Link from "next/link";
import { useState } from "react";
import { ScenarioLibrary } from "./scenario-library";
import { XIcon } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "../ui/dialog";
import { messages, type Locale } from "@peek/core/i18n";
export function DefinitionPicker({
  kind,
  locale,
  packages,
  disabled = false,
}: {
  kind: "scenario" | "connection";
  packages: Status["packages"];
  locale: Locale;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = messages(locale);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          + {kind === "scenario" ? t.add : t.addConnection}
        </Button>
      </DialogTrigger>
      <DialogContent
        locale={locale}
        variant={kind === "scenario" ? "catalog" : "default"}
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogHeader
          className={cn(kind === "scenario" && "px-5 text-left sm:px-7")}
        >
          <DialogTitle>
            {kind === "scenario" ? t.scenarioLibrary : t.chooseConnection}
          </DialogTitle>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-4 top-4"
            aria-label={t.close}
          >
            <XIcon />
          </Button>
        </DialogClose>
        {kind === "scenario" ? (
          <ScenarioLibrary
            packages={packages}
            locale={locale}
            onSelect={() => setOpen(false)}
          />
        ) : (
          <ConnectionTypeChoices packages={packages.filter((p) => p.manifest.kind === kind)} locale={locale} onSelect={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConnectionTypeChoices({ packages, locale, onSelect, embedded = false }: {
  packages: Status["packages"]; locale: Locale; embedded?: boolean;
  onSelect: (packageId: string) => void;
}) {
  const t = messages(locale);
  return <div className="grid gap-3">
    {!packages.length ? <p className="text-sm text-muted-foreground">{t.noConnectionsAvailable}</p> : null}
    {packages.map(({ manifest, iconDataUrl }) => {
      const content = <CardHeader>
        <CardTitle asChild><strong className="flex items-center gap-3">
          <ExtensionIcon kind="connection" src={iconDataUrl} color={manifest.iconColor} />
          {manifest.name}
        </strong></CardTitle>
        <CardDescription asChild><span>{manifest.description}</span></CardDescription>
      </CardHeader>;
      return <Card variant="choice" asChild key={manifest.id}>
        {embedded ? <button type="button" className="w-full text-left" onClick={() => onSelect(manifest.id)}>{content}</button>
          : <Link href={`/connections/new?package=${encodeURIComponent(manifest.id)}`} onClick={() => onSelect(manifest.id)}>{content}</Link>}
      </Card>;
    })}
  </div>;
}

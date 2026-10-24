"use client";
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
}: {
  kind: "scenario" | "integration";
  packages: Status["packages"];
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const t = messages(locale);
  const choices = packages
    .filter((p) => p.manifest.kind === kind)
    .map(({ manifest: m }) => ({
      id: m.id,
      title: m.name,
      description: m.description,
      href: `/settings/connections/new?package=${encodeURIComponent(m.id)}`,
    }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          +{" "}
          {kind === "scenario"
            ? locale === "ru"
              ? "Добавить сценарий"
              : "Add scenario"
            : t.addConnection}
        </Button>
      </DialogTrigger>
      <DialogContent
        variant={kind === "scenario" ? "catalog" : "default"}
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogHeader
          className={cn(kind === "scenario" && "px-5 text-left sm:px-7")}
        >
          <DialogTitle>
            {kind === "scenario" ? t.scenarioLibrary : t.chooseIntegration}
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
          <div className="grid gap-3">
            {!choices.length ? (
              <p>
                {locale === "ru"
                  ? "Нет доступных подключений."
                  : "No connections available."}
              </p>
            ) : null}
            {choices.map((choice) => (
              <Card variant="choice" asChild key={choice.id}>
                <Link href={choice.href} onClick={() => setOpen(false)}>
                  <CardHeader>
                    <CardTitle asChild>
                      <strong className="flex items-center gap-3">
                        {choice.title}
                      </strong>
                    </CardTitle>
                    <CardDescription asChild>
                      <span>{choice.description}</span>
                    </CardDescription>
                  </CardHeader>
                  <span
                    className="absolute right-4 top-6 text-2xl text-choice-foreground"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

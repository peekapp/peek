"use client";
import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import Link from "next/link";
import { useState } from "react";
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
import {
  integrationDefinitions,
  scenarioDefinitions,
} from "@peek/core/registry";

export function DefinitionPicker({
  kind,
  locale,
}: {
  kind: "scenario" | "connection";
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const t = messages(locale);
  const choices =
    kind === "scenario"
      ? scenarioDefinitions.map((d) => ({
          id: d.id,
          title: t[d.nameKey],
          description: t[d.descriptionKey],
          href: `/settings/scenarios/new-${d.id}`,
        }))
      : integrationDefinitions.map((d) => ({
          id: d.id,
          title: d.name,
          description: t[d.descriptionKey],
          href: `/settings/connections/new-${d.id}`,
        }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          + {kind === "scenario" ? t.createScenario : t.addConnection}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {kind === "scenario" ? t.chooseScenario : t.chooseIntegration}
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
        <div className="picker-options">
          {choices.map((choice) => (
            <Card variant="choice" asChild key={choice.id}>
              <Link href={choice.href} onClick={() => setOpen(false)}>
                <CardHeader>
                  <CardTitle asChild>
                    <strong>{choice.title}</strong>
                  </CardTitle>
                  <CardDescription asChild>
                    <span>{choice.description}</span>
                  </CardDescription>
                </CardHeader>
                <span className="picker-arrow" aria-hidden="true">
                  ›
                </span>
              </Link>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

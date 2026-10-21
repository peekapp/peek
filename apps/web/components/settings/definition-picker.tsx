"use client";
import Link from "next/link";
import { useRef } from "react";
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
  const dialog = useRef<HTMLDialogElement>(null);
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
    <>
      <button onClick={() => dialog.current?.showModal()}>
        + {kind === "scenario" ? t.createScenario : t.addConnection}
      </button>
      <dialog
        ref={dialog}
        className="definition-picker"
        aria-labelledby={`${kind}-picker-title`}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="picker-header">
          <h2 id={`${kind}-picker-title`}>
            {kind === "scenario" ? t.chooseScenario : t.chooseIntegration}
          </h2>
          <button
            className="quiet-button"
            aria-label={t.close}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <div className="picker-options">
          {choices.map((choice) => (
            <Link
              key={choice.id}
              href={choice.href}
              onClick={() => dialog.current?.close()}
            >
              <strong>{choice.title}</strong>
              <span>{choice.description}</span>
              <span className="picker-arrow" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      </dialog>
    </>
  );
}

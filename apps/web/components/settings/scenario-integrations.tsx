"use client";

import { integrationDefinitions } from "@peek/core/registry";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { IntegrationIcon } from "./integration-icon";

export function ScenarioIntegrations({
  integrationIds,
}: {
  integrationIds: string[];
}) {
  const integrations = integrationDefinitions.filter((definition) =>
    integrationIds.includes(definition.id),
  );
  if (!integrations.length) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {integrations.map((integration) => (
        <Tooltip key={integration.id}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={integration.name}
              className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
            >
              <IntegrationIcon integrationId={integration.id} size={16} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{integration.name}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

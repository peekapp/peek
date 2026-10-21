import { integrationDefinitions } from "@peek/core/registry";

/** Assets belong to integration definitions, including full-color service logos. */
export function IntegrationIcon({ integrationId }: { integrationId?: string }) {
  const definition = integrationDefinitions.find((d) => d.id === integrationId);
  return (
    <img
      src={definition?.icon.src ?? "/integrations/demo.svg"}
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      className="size-6 shrink-0 object-contain"
    />
  );
}

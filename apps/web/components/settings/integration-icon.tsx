import { integrationDefinitions } from "@peek/core/registry";

/** Assets belong to integration definitions, including full-color service logos. */
export function IntegrationIcon({
  integrationId,
  size = 24,
}: {
  integrationId?: string;
  size?: 16 | 24;
}) {
  const definition = integrationDefinitions.find((d) => d.id === integrationId);
  return (
    <img
      src={definition?.icon.src ?? "/integrations/demo.svg"}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  );
}

import type { Manifest } from "@peekapp/sdk";
import { acceptsContract } from "@peek/extensions/compatibility";

export type Binding = { connectionId: string; dataset: string };

export function connectionScenarios<T extends { kind: string; bindings: Record<string, Binding[]> }>(instances: T[], connectionId: string): T[] {
  return instances.filter((instance) => instance.kind === "scenario" &&
    Object.values(instance.bindings).some((bindings) => bindings.some((binding) => binding.connectionId === connectionId)));
}
export function connectionInputs(manifest: Manifest, connections: { id: string; name: string; enabled: boolean; contracts: Record<string, { id: string; version: string }> }[]) {
  return Object.entries(manifest.inputs ?? {}).map(([input, requirement]) => ({
    input, requirement,
    choices: connections.flatMap((connection) => Object.entries(connection.contracts)
      .filter(([, contract]) => acceptsContract(manifest, requirement, contract))
      .map(([dataset]) => ({ ...connection, connectionId: connection.id, dataset }))),
  }));
}
export function compatiblePackages<T extends { manifest: Manifest }>(manifest: Manifest, input: string, packages: T[]) {
  const requirement = manifest.inputs?.[input];
  return requirement ? packages.filter(({ manifest: producer }) => producer.kind === "connection" &&
    Object.values(producer.provides ?? {}).some((contract) => acceptsContract(manifest, requirement, contract))) : [];
}
export function selectBinding(current: Binding[], binding: Binding, checked: boolean, multiple: boolean) {
  const rest = current.filter((b) => b.connectionId !== binding.connectionId || b.dataset !== binding.dataset);
  return checked ? [...(multiple ? rest : []), { connectionId: binding.connectionId, dataset: binding.dataset }] : rest;
}

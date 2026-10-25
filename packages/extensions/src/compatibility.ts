import satisfies from "semver/functions/satisfies";
import type { Manifest } from "@peekapp/sdk";

export function compatible(version: string, range: string) {
  return satisfies(version, range);
}

export function acceptsContract(
  manifest: Manifest,
  input: NonNullable<Manifest["inputs"]>[string],
  contract: { id: string; version: string },
) {
  return (
    contract.id === input.contract &&
    compatible(contract.version, input.version) &&
    (manifest.contracts ?? []).some(
      (d) => d.id === contract.id && d.version === contract.version,
    )
  );
}

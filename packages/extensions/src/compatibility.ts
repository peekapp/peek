import satisfies from "semver/functions/satisfies";

export function compatible(version: string, range: string) {
  return satisfies(version, range);
}

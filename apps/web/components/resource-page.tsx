import { Settings } from "./settings";
import { readState } from "../lib/server-state";

/** Server entry point shared by resource lists and editors. */
export function ResourcePage({
  section,
  item,
  packageId,
}: {
  section: "screens" | "scenarios" | "connections" | "profiles";
  item?: string;
  packageId?: string;
}) {
  let locale: "en" | "ru" = "en";
  try {
    locale = readState().locale ?? "en";
  } catch {}
  return (
    <Settings
      initialLocale={locale}
      path={item ? [section, item] : [section]}
      packageId={packageId}
    />
  );
}

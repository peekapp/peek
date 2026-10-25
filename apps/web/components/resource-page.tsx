import { Settings } from "./settings";
import { headers } from "next/headers";
import { settingsRequestAllowed } from "../lib/request-access";
import { readSettings, readExtensions } from "../lib/settings-data";

/** Server entry point shared by resource lists and editors. */
export async function ResourcePage({
  section,
  item,
  packageId,
}: {
  section:
    | "screens"
    | "scenarios"
    | "connections"
    | "profiles"
    | "general"
    | "extensions";
  item?: string;
  packageId?: string;
}) {
  let initialData = null;
  let initialExtensions = null;
  const request = new Request("http://localhost", { headers: await headers() });
  if (settingsRequestAllowed(request)) {
    try {
      initialData = readSettings();
    } catch {}
    if (["scenarios", "connections", "extensions"].includes(section)) {
      try {
        initialExtensions = readExtensions();
      } catch {}
    }
  }
  return (
    <Settings
      key={`${section}/${item ?? ""}/${packageId ?? ""}`}
      initialData={initialData}
      initialExtensions={initialExtensions}
      path={item ? [section, item] : [section]}
      packageId={packageId}
    />
  );
}

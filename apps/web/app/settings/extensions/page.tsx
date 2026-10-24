import { Settings } from "../../../components/settings";
import { readState } from "../../../lib/server-state";
export const dynamic = "force-dynamic";
export default function ExtensionsPage() {
  let locale: "en" | "ru" = "en";
  try {
    locale = readState().locale ?? "en";
  } catch {}
  return <Settings initialLocale={locale} path={["extensions"]} />;
}

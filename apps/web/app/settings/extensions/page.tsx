import { Extensions } from "../../../components/settings/extensions";
import { readState } from "../../../lib/server-state";
export const dynamic = "force-dynamic";
export default function ExtensionsPage() {
  let locale: "en" | "ru" = "en";
  try {
    locale = readState().locale ?? "en";
  } catch {}
  return <Extensions locale={locale} />;
}

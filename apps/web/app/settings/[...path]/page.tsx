import { Settings } from "../../../components/settings";
import { readState } from "../../../lib/server-state";
import { notFound, redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function SettingsSection({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  if (path[0] === "calendars")
    redirect(`/settings/connections${path[1] ? `/${path[1]}` : ""}`);
  if (
    !["general", "connections", "scenarios", "profiles"].includes(path[0]) ||
    path.length > 2 ||
    (path[0] === "general" && path.length > 1)
  )
    notFound();
  let locale: "en" | "ru" = "en";
  try {
    locale = readState().locale ?? "en";
  } catch {}
  return <Settings path={path} initialLocale={locale} />;
}

import { Settings } from "../../../components/settings";
import { readState } from "../../../lib/server-state";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function SettingsSection({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ package?: string | string[] }>;
}) {
  const { path } = await params;
  if (
    !["general", "connections", "scenarios", "profiles", "screens"].includes(
      path[0],
    ) ||
    path.length > 2 ||
    (path[0] === "general" && path.length > 1)
  )
    notFound();
  let locale: "en" | "ru" = "en";
  try {
    locale = readState().locale ?? "en";
  } catch {}
  const query = await searchParams;
  return (
    <Settings
      path={path}
      initialLocale={locale}
      packageId={typeof query.package === "string" ? query.package : undefined}
    />
  );
}

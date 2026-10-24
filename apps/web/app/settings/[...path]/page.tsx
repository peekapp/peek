import { notFound, redirect } from "next/navigation";

export default async function LegacySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const [section, item] = path;
  if (path.length > 2) notFound();
  let destination: string;
  if (section === "general" && !item) destination = "/settings";
  else if (section === "screens") {
    destination = !item
      ? "/screens"
      : item === "new"
        ? "/screens/new"
        : `/screens/${encodeURIComponent(item)}/edit`;
  } else if (["scenarios", "profiles", "connections"].includes(section)) {
    destination = `/${section}${item ? `/${encodeURIComponent(item)}` : ""}`;
  } else notFound();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      search.append(key, entry);
  }
  redirect(`${destination}${search.size ? `?${search}` : ""}`);
}

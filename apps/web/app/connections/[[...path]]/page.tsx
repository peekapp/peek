import { notFound } from "next/navigation";
import { ResourcePage } from "@/components/resource-page";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ package?: string | string[] }>;
}) {
  const [{ path = [] }, query] = await Promise.all([params, searchParams]);
  if (path.length > 1) notFound();
  return (
    <ResourcePage
      section="connections"
      item={path[0]}
      packageId={typeof query.package === "string" ? query.package : undefined}
    />
  );
}

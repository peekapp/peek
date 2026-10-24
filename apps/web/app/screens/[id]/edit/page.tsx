import { ResourcePage } from "@/components/resource-page";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResourcePage section="screens" item={id} />;
}

import { notFound } from "next/navigation";
import { Dashboard } from "../../../components/dashboard";
import { readState } from "../../../lib/server-state";
export const dynamic = "force-dynamic";
export default async function ScreenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    return <Dashboard key={id} screenId={id} initialState={readState(id)} />;
  } catch (error) {
    if (error instanceof Error && error.message === "screen-not-found")
      notFound();
    return (
      <Dashboard
        key={id}
        screenId={id}
        initialState={{
          cards: [],
          revision: -1,
          heartbeat: null,
          serverTime: Date.now(),
        }}
        storageUnavailable
      />
    );
  }
}

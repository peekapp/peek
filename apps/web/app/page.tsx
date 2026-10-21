import { Dashboard } from "../components/dashboard";
import { createDemoCards } from "../lib/demo-screen";

// Each request starts a demo session; do not bake timestamps into the build.
export const dynamic = "force-dynamic";

export default function Home() {
  const now = Date.now();
  return <Dashboard cards={createDemoCards(now)} initialNow={now} />;
}

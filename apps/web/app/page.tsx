import { Dashboard } from "../components/dashboard";
import { readState } from "../lib/server-state";
export const dynamic = "force-dynamic";
export default function Home() {
  try {
    return <Dashboard initialState={readState()} />;
  } catch {
    return (
      <Dashboard
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

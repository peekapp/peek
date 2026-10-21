import { redirect } from "next/navigation";
import { databasePath, openStore } from "@peek/db";
import { Dashboard } from "../components/dashboard";
export const dynamic = "force-dynamic";
export default function Home() {
  let id: string | undefined;
  try {
    const store = openStore(databasePath(), true);
    try {
      id = store.listScreens()[0]?.id;
    } finally {
      store.close();
    }
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
  redirect(id ? `/screens/${id}` : "/settings/screens");
}

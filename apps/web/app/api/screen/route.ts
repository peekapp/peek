import { readState } from "../../../lib/server-state";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return Response.json(readState(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Storage unavailable" }, { status: 503 });
  }
}

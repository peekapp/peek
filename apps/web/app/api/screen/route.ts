import { readState } from "../../../lib/server-state";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return Response.json(readState(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Screen snapshot failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json({ error: "Storage unavailable" }, { status: 503 });
  }
}
